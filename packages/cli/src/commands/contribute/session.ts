/**
 * The coordinator as `contribute` talks to it (SPEC §4.1–4.4): every answer validated before
 * anything uses it (it becomes paths and terminal text), transient failures (network, 429, 5xx)
 * retried with backoff, the slot kept alive, the session ended even while a verification is in
 * flight, and the head checked against the ceremony's own announcement.
 */
import {
  asArray,
  asObject,
  asOneOf,
  asSafeInt,
  CEREMONY_LAYOUT,
  CEREMONY_STATES,
  CIRCUIT_ORDER,
  type CircuitName,
  CONTRIBUTOR_PATHS,
  fromUtf8,
  MAX_DOCUMENT_BYTES,
  normalizeHex,
  parseAnnouncement,
  parseInit,
  REJECT_REASONS,
} from "@orbinum-ceremony/core";
import { type Contributor, ContributorRefusal, contributorCall, fetchAnnounced } from "../../io";

/** How long transient failures are retried, counted from the first one. */
const RETRY_FOR_MS = 60_000;
const MAX_BACKOFF_MS = 10_000;
/** Heartbeats every 15 s keep the slot well inside its 90 s window (SPEC §4.2). */
const HEARTBEAT_MS = 15_000;
/** Consecutive transient heartbeat failures (60 s) before the slot is given up. */
const HEARTBEAT_FAILURES = 4;
const FINISH_POLL_MS = 2_000;
/** Ending a session waits at most this long for a verification in flight to settle. */
const FINISH_FOR_MS = 15 * 60_000;

const SLOT_STATUSES = ["todo", "verifying", "accepted", "skipped"] as const;
const RESULTS = ["pending", "valid", "rejected", "ambiguous", "infra", "stale"] as const;

/** One's place in line or one's session, as validated values only. */
export interface SlotView {
  phase: (typeof CEREMONY_STATES)[number];
  position: number | null;
  slot: {
    seq: number;
    claimed: boolean;
    circuits: { circuit: CircuitName; status: (typeof SLOT_STATUSES)[number] }[];
  } | null;
}

/** The latest upload of a circuit and its verdict, as validated values only. */
export interface Verdict {
  seq: number;
  outputSha256: string;
  status: (typeof RESULTS)[number];
  reason: string;
}

/** The coordinator no longer takes this token: the run cannot go on, nor end the session. */
export class TokenRefused extends Error {
  override readonly name = "TokenRefused";
}

/** Waits `ms`, or rejects at once if `signal` aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("interrupted"));
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", stop);
      resolve();
    }, ms);
    const stop = () => {
      clearTimeout(timer);
      reject(new Error("interrupted"));
    };
    signal?.addEventListener("abort", stop, { once: true });
  });
}

/** A failure worth retrying: the network, a timeout, a rate limit, or the coordinator's fault. */
export const isTransient = (error: unknown) =>
  !(error instanceof ContributorRefusal) || error.status === 429 || error.status >= 500;

/** A 401 as the error the run reports: the token, not the coordinator, is the problem. */
const tokenChecked = (error: unknown) =>
  error instanceof ContributorRefusal && error.status === 401
    ? new TokenRefused("the CLI token was refused (expired?): create a new one in the browser")
    : error;

/** `call`, retried with backoff on transient failures for `RETRY_FOR_MS` after the first one. */
export async function retrying<T>(call: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  let deadline: number | undefined;
  for (let wait = 1000; ; wait = Math.min(2 * wait, MAX_BACKOFF_MS)) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- one attempt after the other, with backoff
      return await call();
    } catch (error) {
      deadline ??= Date.now() + RETRY_FOR_MS;
      if (!isTransient(error) || Date.now() + wait > deadline || signal?.aborted) {
        throw tokenChecked(error);
      }
    }
    // oxlint-disable-next-line no-await-in-loop -- backoff between attempts
    await sleep(wait, signal);
  }
}

/** `GET /api/queue/me`, validated. */
export async function placeOf(who: Contributor, signal?: AbortSignal): Promise<SlotView> {
  const v = await retrying(
    () => contributorCall(who, "GET", CONTRIBUTOR_PATHS.me, { signal }),
    signal,
  );
  const slot = v.slot === null ? null : asObject(v.slot, "me.slot");
  return {
    phase: asOneOf(v.phase, "me.phase", CEREMONY_STATES),
    position: v.position === null ? null : asSafeInt(v.position, "me.position", 1, 2 ** 32),
    slot: slot && {
      seq: asSafeInt(slot.seq, "me.slot.seq", 1, 2 ** 32),
      claimed: slot.claimed === true,
      circuits: asArray(slot.circuits, "me.slot.circuits", CIRCUIT_ORDER.length).map((c, i) => {
        const o = asObject(c, `me.slot.circuits[${i}]`);
        return {
          circuit: asOneOf(o.circuit, `me.slot.circuits[${i}].circuit`, CIRCUIT_ORDER),
          status: asOneOf(o.status, `me.slot.circuits[${i}].status`, SLOT_STATUSES),
        };
      }),
    },
  };
}

/** `POST /api/session/claim`; a claim that already landed (its answer lost) counts. */
export async function claim(who: Contributor, signal?: AbortSignal): Promise<void> {
  try {
    await retrying(() => contributorCall(who, "POST", CONTRIBUTOR_PATHS.claim, { signal }), signal);
  } catch (error) {
    if (!(error instanceof ContributorRefusal) || error.code !== "already-claimed") throw error;
  }
}

/** `POST /api/queue/leave`, best effort: a run that stops while waiting gives its place back. */
export async function leave(who: Contributor): Promise<boolean> {
  try {
    await retrying(() => contributorCall(who, "POST", CONTRIBUTOR_PATHS.leave));
    return true;
  } catch {
    return false;
  }
}

/** `GET /api/session/result/:circuit`, validated; null before this identity's first upload. */
export async function verdictOf(
  who: Contributor,
  circuit: CircuitName,
  signal?: AbortSignal,
): Promise<Verdict | null> {
  let r;
  try {
    r = await retrying(
      () => contributorCall(who, "GET", CONTRIBUTOR_PATHS.result(circuit), { signal }),
      signal,
    );
  } catch (error) {
    if (error instanceof ContributorRefusal && error.code === "unknown-job") return null;
    throw error;
  }
  return {
    seq: asSafeInt(r.seq, "result.seq", 1, 2 ** 32),
    outputSha256: normalizeHex(r.output_sha256, "result.output_sha256", 32),
    status: asOneOf(r.status, "result.status", RESULTS),
    reason: r.reason === undefined ? "" : asOneOf(r.reason, "result.reason", REJECT_REASONS),
  };
}

/**
 * Heartbeats until stopped, the first one at once (a restarted run may be close to its window).
 * The session counts as lost on a refusal (the coordinator ended it, or refused the token) or
 * after `HEARTBEAT_FAILURES` transient failures in a row, never on one.
 */
export function keepAlive(who: Contributor) {
  let lost: Error | null = null;
  let failures = 0;
  const beat = () =>
    contributorCall(who, "POST", CONTRIBUTOR_PATHS.heartbeat).then(
      () => {
        failures = 0;
      },
      (error: unknown) => {
        failures += 1;
        if (!isTransient(error) || failures >= HEARTBEAT_FAILURES) {
          const e = tokenChecked(error);
          lost =
            e instanceof TokenRefused
              ? e
              : new Error(
                  `the session ended: ${e instanceof Error ? e.message : "heartbeat failed"}`,
                );
          clearInterval(timer);
        }
      },
    );
  const timer = setInterval(() => void beat(), HEARTBEAT_MS);
  void beat();
  return {
    /** The error that ended the session, or null while it holds. */
    lost: () => lost,
    stop: () => clearInterval(timer),
  };
}

/**
 * Ends the session: retried while a verification is in flight (`busy`) or the coordinator falters;
 * a session that is already over (any other refusal) is fine. Throws if it never lands, or if the
 * token is refused (the slot then lapses).
 */
export async function finish(who: Contributor): Promise<void> {
  const deadline = Date.now() + FINISH_FOR_MS;
  for (;;) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- one attempt after the other
      await contributorCall(who, "POST", CONTRIBUTOR_PATHS.finish);
      return;
    } catch (error) {
      if (error instanceof ContributorRefusal && error.status === 401) throw tokenChecked(error);
      const busy = error instanceof ContributorRefusal && error.code === "busy";
      if (!busy && !isTransient(error)) return;
      if (Date.now() > deadline) throw error;
    }
    // oxlint-disable-next-line no-await-in-loop -- waits for the verification to settle
    await sleep(FINISH_POLL_MS);
  }
}

/** The lifetime left to a CLI token, from its own (unverified) payload; 0 if it has none. */
export function tokenLifeMs(token: string, now: number): number {
  try {
    const body = token.slice(0, token.indexOf("."));
    const exp = (JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { exp?: unknown })
      .exp;
    return typeof exp === "number" && Number.isFinite(exp) ? exp - now : 0;
  } catch {
    return 0;
  }
}

/**
 * The csHash of each circuit, from the ceremony's own anchors: `ceremony.json` must hash to the
 * officially announced SHA-256, and `init.json` to the hash it pins. A head that is not the
 * announced circuit's is refused before anything is contributed to it.
 */
export async function anchoredCsHashes(
  who: Contributor,
  announcementSha256: string,
): Promise<Map<CircuitName, string>> {
  const doc = async (key: string, sha256: string) =>
    fromUtf8(await fetchAnnounced(who.origin, `/artifacts/${key}`, sha256, MAX_DOCUMENT_BYTES));
  const announcement = parseAnnouncement(
    await doc(CEREMONY_LAYOUT.announcement, announcementSha256),
  );
  const init = parseInit(await doc(CEREMONY_LAYOUT.init, announcement.init_sha256));
  return new Map(init.circuits.map((c) => [c.name, c.cs_hash]));
}
