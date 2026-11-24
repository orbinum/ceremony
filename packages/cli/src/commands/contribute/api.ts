/**
 * The coordinator's session API as `contribute` uses it (SPEC §4.1–4.4): every answer validated
 * before anything uses it (it becomes paths and terminal text), transient failures retried, the
 * slot kept alive, and the session ended even while a verification is in flight.
 */
import {
  asArray,
  asCircuitName,
  asObject,
  asOneOf,
  asSafeInt,
  CEREMONY_STATES,
  type CircuitName,
  CLAIM_HEADER,
  type ContributionClaim,
  CONTRIBUTOR_PATHS,
  MAX_CIRCUITS,
  normalizeHex,
  REJECT_REASONS,
} from "@orbinum-ceremony/core";
import { type Contributor, contributorCall } from "../../io";
import { isTransient, refusedWith, retrying, sleep, TokenRefused, tokenChecked } from "./retry";

/** Heartbeats every 15 s keep the slot well inside its 90 s window (SPEC §4.2). */
const HEARTBEAT_MS = 15_000;
/** Consecutive transient heartbeat failures (60 s) before the slot is given up. */
const HEARTBEAT_FAILURES = 4;
const FINISH_POLL_MS = 2_000;
/** Ending a session waits at most this long for a verification in flight to settle. */
const FINISH_FOR_MS = 15 * 60_000;
/** An upload of the largest key over a slow link: the same bound as a download. */
const UPLOAD_TIMEOUT_MS = 30 * 60_000;

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

/** A circuit's head as the coordinator names it, validated: its index, key and download. */
export interface Head {
  index: number;
  outputSha256: string;
  url: string;
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
      circuits: asArray(slot.circuits, "me.slot.circuits", MAX_CIRCUITS).map((c, i) => {
        const o = asObject(c, `me.slot.circuits[${i}]`);
        return {
          circuit: asCircuitName(o.circuit, `me.slot.circuits[${i}].circuit`),
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
    if (!refusedWith(error, "already-claimed")) throw error;
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

/** `GET /api/session/head/:circuit`, validated. */
export async function headOf(
  who: Contributor,
  circuit: CircuitName,
  signal?: AbortSignal,
): Promise<Head> {
  const h = await retrying(
    () => contributorCall(who, "GET", CONTRIBUTOR_PATHS.head(circuit), { signal }),
    signal,
  );
  if (typeof h.url !== "string") throw new Error("the head names no download");
  return {
    index: asSafeInt(h.index, "head.index", 0, Number.MAX_SAFE_INTEGER),
    outputSha256: normalizeHex(h.output_sha256, "head.output_sha256", 32),
    url: h.url,
  };
}

/** `PUT /api/session/upload/:circuit`: the contribution's bytes, under its claim. */
export async function upload(
  who: Contributor,
  circuit: CircuitName,
  claimed: ContributionClaim,
  bytes: Uint8Array,
  signal?: AbortSignal,
): Promise<void> {
  await contributorCall(who, "PUT", CONTRIBUTOR_PATHS.upload(circuit), {
    headers: {
      [CLAIM_HEADER]: JSON.stringify(claimed),
      "content-type": "application/octet-stream",
    },
    body: bytes,
    timeoutMs: UPLOAD_TIMEOUT_MS,
    signal,
  });
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
    if (refusedWith(error, "unknown-job")) return null;
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
      await contributorCall(who, "POST", CONTRIBUTOR_PATHS.finish);
      return;
    } catch (error) {
      const refused = tokenChecked(error);
      if (refused instanceof TokenRefused) throw refused;
      if (!refusedWith(error, "busy") && !isTransient(error)) return;
      if (Date.now() > deadline) throw error;
    }
    await sleep(FINISH_POLL_MS);
  }
}
