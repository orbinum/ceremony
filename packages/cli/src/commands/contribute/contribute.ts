/**
 * `contribute`: a contributor's session from the command line (SPEC §4.1, §4.4). Anchors the
 * ceremony in its announced `ceremony.json`, waits for the slot and claims it, keeps it with
 * heartbeats, and for each circuit in order downloads the head (checked against the announced
 * hash and the circuit's anchored csHash), contributes in a snarkjs child process that draws the
 * randomness itself and exits right after (no secret ever reaches this process), checks the output
 * with the very pre-checks the verifier runs, uploads it as `cli` and waits for its verdict. The
 * loop follows the queue's own rules (a rejection is retried once, `infra` and `stale` pause and
 * come back, a pause waits); the session is ended whatever happens, and a run stopped while
 * waiting gives its place in line back. The attestation is signed in the browser.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  asSafeInt,
  type CircuitName,
  CLAIM_HEADER,
  type ClientInfo,
  CONTRIBUTOR_PATHS,
  genesisLayoutOf,
  MAX_FILE_BYTES,
  normalizeHex,
  precheckUpload,
  readMpcParams,
  SESSION_RULES,
  sha256Hex,
} from "@orbinum-ceremony/core";
import {
  type Contributor,
  ContributorRefusal,
  contributorCall,
  ensureDir,
  fetchAnnounced,
  writeJson,
} from "../../io";
import { contribute, resolveCommit } from "../../tools";
import type { Command } from "../types";
import { CONTRIBUTE_USAGE, type ContributeOptions, parseContributeOptions } from "./options";
import {
  anchoredCsHashes,
  claim,
  finish,
  isTransient,
  keepAlive,
  leave,
  placeOf,
  retrying,
  sleep,
  TokenRefused,
  tokenLifeMs,
  type Verdict,
  verdictOf,
} from "./session";

/** How often the place in line is polled while waiting (the claim window is 30 s). */
const WAIT_POLL_MS = 3_000;
const RESULT_POLL_MS = 2_000;
/** A verdict takes seconds; past this the coordinator's own deadline has long passed. */
const RESULT_TIMEOUT_MS = 15 * 60_000;
/** An upload of the largest key over a slow link: the same bound as a download. */
const UPLOAD_TIMEOUT_MS = 30 * 60_000;
/** Contributions to one circuit in one run: two rejections end it, retries are bounded. */
const MAX_ATTEMPTS = 4;

/** One accepted contribution, as the records and the attestation name it. */
export interface ContributionSummary {
  circuit: CircuitName;
  index: number;
  inputSha256: string;
  outputSha256: string;
  contributionHash: string;
}

/** What a session leaves: its seq, this run's accepted contributions, and earlier runs' count. */
export interface SessionSummary {
  seq: number;
  contributions: ContributionSummary[];
  /** Circuits of this session accepted before this run (their hashes are in the receipt). */
  earlier: number;
}

/** Progress lines (all from validated values: nothing the coordinator wrote reaches a terminal). */
type Log = (line: string) => void;

/** The client the records name: this checkout's package version and commit. */
async function thisClient(): Promise<ClientInfo> {
  const root = join(import.meta.dirname, "..", "..", "..");
  const { version } = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
    version: string;
  };
  let commit: string;
  try {
    commit = (await resolveCommit(root, "HEAD")).slice(0, 12);
  } catch {
    throw new Error("run contribute from a git checkout of the ceremony repository");
  }
  return { name: "orbinum-ceremony-cli", version, commit };
}

/** A token too short-lived for a whole session (the active cap and some margin): stop early. */
function assertTokenLife(token: string, waiting: boolean) {
  if (tokenLifeMs(token, Date.now()) >= SESSION_RULES.cliTokenMinMs) return;
  const minutes = SESSION_RULES.cliTokenMinMs / 60_000;
  const kept = waiting ? " and run again (your place in line is kept)" : "";
  throw new TokenRefused(
    `the CLI token expires within ${minutes} min: create a new one in the browser${kept}`,
  );
}

/**
 * Waits in line until the slot is this contributor's, then claims it. Returns its seq and how many
 * of its circuits were accepted before this run (a restarted run).
 */
async function takeSlot(who: Contributor, log: Log, signal?: AbortSignal) {
  let shown: number | null = null;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- polls the queue until the turn comes
    const view = await placeOf(who, signal);
    if (tokenLifeMs(who.token, Date.now()) < SESSION_RULES.cliTokenMinMs) {
      // A turn it could not finish is handed back unclaimed, which costs nothing (a lapsed one
      // would count as a no-show); a place in line is simply kept.
      // oxlint-disable-next-line no-await-in-loop -- once, before stopping
      if (view.slot && !view.slot.claimed) await leave(who);
      assertTokenLife(who.token, view.slot === null);
    }
    if (view.slot) {
      // oxlint-disable-next-line no-await-in-loop -- once, when the turn comes
      if (!view.slot.claimed) await claim(who, signal);
      log(`session ${view.slot.seq}: claimed`);
      const earlier = view.slot.circuits.filter((c) => c.status === "accepted").length;
      return { seq: view.slot.seq, earlier };
    }
    if (view.phase === "CLOSED" || view.phase === "FINALIZED") {
      throw new Error(`the ceremony is ${view.phase}`);
    }
    if (view.position === null) {
      throw new Error("not in the queue: join it in the browser first (it needs a bot check)");
    }
    if (view.position !== shown) log(`waiting: position ${(shown = view.position)}`);
    // oxlint-disable-next-line no-await-in-loop -- polls the queue until the turn comes
    await sleep(WAIT_POLL_MS, signal);
  }
}

/**
 * The verdict of this session's latest upload of `circuit` (of exactly `outputSha256` when given),
 * once it has one.
 */
async function settled(
  who: Contributor,
  circuit: CircuitName,
  seq: number,
  outputSha256: string | null,
  signal?: AbortSignal,
): Promise<Verdict> {
  const deadline = Date.now() + RESULT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop -- polls the result as the client does
    const v = await verdictOf(who, circuit, signal);
    const ours = v && v.seq === seq && (outputSha256 === null || v.outputSha256 === outputSha256);
    if (ours && v.status !== "pending") return v;
    // oxlint-disable-next-line no-await-in-loop -- polls the result as the client does
    await sleep(RESULT_POLL_MS, signal);
  }
  throw new Error(`${circuit}: no verdict after ${RESULT_TIMEOUT_MS / 60_000} min`);
}

/** What one contribution needs. */
interface Step {
  who: Contributor;
  circuit: CircuitName;
  csHash: string;
  seq: number;
  client: ClientInfo;
  work: string;
  signal?: AbortSignal;
}

/** A contribution that got a verdict, or one to try again (the upload did not land). */
type Attempt = { verdict: Verdict; summary: ContributionSummary } | { verdict: null; why: string };

/**
 * One contribution to `circuit`: the public bytes this process holds (head, output) are zeroed
 * and their files removed whatever happens.
 */
async function contributeTo(step: Step): Promise<Attempt> {
  const { who, circuit, seq, signal } = step;
  const head = await retrying(
    () => contributorCall(who, "GET", CONTRIBUTOR_PATHS.head(circuit), { signal }),
    signal,
  );
  const index = asSafeInt(head.index, "head.index", 0, Number.MAX_SAFE_INTEGER);
  const inputSha256 = normalizeHex(head.output_sha256, "head.output_sha256", 32);
  if (typeof head.url !== "string") throw new Error("the head names no download");
  const dir = await mkdtemp(join(step.work, `${circuit}-`));
  let input: Uint8Array = new Uint8Array();
  let output: Uint8Array = new Uint8Array();
  try {
    input = await fetchAnnounced(who.origin, head.url, inputSha256, MAX_FILE_BYTES);
    const params = readMpcParams(input);
    if (params.csHash !== step.csHash) {
      throw new Error(`${circuit}: the head is not the announced circuit's (csHash differs)`);
    }
    const inPath = join(dir, "head.zkey");
    const outPath = join(dir, "contribution.zkey");
    await writeFile(inPath, input, { mode: 0o600, flag: "wx" });
    // An empty entropy: the child draws it, so this process never holds it (SPEC §2.4).
    const contributionHash = await contribute(inPath, outPath, String(seq), "");
    output = new Uint8Array(await readFile(outPath));
    const claimed = {
      inputSha256,
      outputSha256: sha256Hex(output),
      contributionHash,
      method: "cli" as const,
      client: step.client,
    };
    // The verifier's own pre-checks, before a byte is uploaded: a fault is caught here.
    const pre = precheckUpload(
      output,
      claimed,
      {
        csHash: step.csHash,
        previous: params.entries.map((e) => ({
          hash: e.hash,
          name: e.name ?? "",
          deltaAfter: e.deltaAfter,
        })),
        outputSha256: inputSha256,
      },
      genesisLayoutOf(input),
    );
    if (!pre.ok || pre.index !== index + 1) {
      throw new Error(`${circuit}: the contribution fails its own check`);
    }
    if (signal?.aborted) throw new Error("interrupted");
    try {
      await contributorCall(who, "PUT", CONTRIBUTOR_PATHS.upload(circuit), {
        headers: {
          [CLAIM_HEADER]: JSON.stringify(claimed),
          "content-type": "application/octet-stream",
        },
        body: output,
        timeoutMs: UPLOAD_TIMEOUT_MS,
        signal,
      });
    } catch (error) {
      // Paused (or closed) while this was computed: the loop waits, then tries again.
      if (error instanceof ContributorRefusal && error.code === "not-open") {
        return { verdict: null, why: "the ceremony paused meanwhile" };
      }
      if (!isTransient(error) || signal?.aborted) throw error;
      // The answer may be lost after the upload landed: this session's latest upload of these
      // exact bytes is this one, so its verdict is awaited as usual.
      const v = await verdictOf(who, circuit, signal);
      if (!v || v.seq !== seq || v.outputSha256 !== claimed.outputSha256) {
        return { verdict: null, why: "the upload did not go through" };
      }
    }
    const verdict = await settled(who, circuit, seq, claimed.outputSha256, signal);
    const summary: ContributionSummary = {
      circuit,
      index: index + 1,
      inputSha256,
      outputSha256: claimed.outputSha256,
      contributionHash,
    };
    return { verdict, summary };
  } finally {
    input.fill(0);
    output.fill(0);
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * The contributions of the slot `seq`, circuit by circuit, until none is left to do. Returns this
 * run's accepted ones and how many earlier uploads it saw settle as accepted.
 */
async function contributeAll(
  who: Contributor,
  seq: number,
  base: Omit<Step, "who" | "circuit" | "csHash" | "seq">,
  csHashes: Map<CircuitName, string>,
  heart: { lost: () => Error | null },
  log: Log,
) {
  const accepted = new Map<CircuitName, ContributionSummary>();
  const attempts = new Map<CircuitName, number>();
  let earlier = 0;
  for (;;) {
    if (base.signal?.aborted) throw new Error("interrupted");
    // oxlint-disable-next-line no-await-in-loop -- one circuit after the other (SPEC §4.1)
    const view = await placeOf(who, base.signal);
    // A session whose every circuit is done closes itself (a heartbeat refused then is fine).
    if (!view.slot || view.slot.seq !== seq) break;
    const lost = heart.lost();
    if (lost) throw lost;
    // An upload of an earlier run still in verification: let it settle before going on.
    const pending = view.slot.circuits.find((c) => c.status === "verifying");
    if (pending) {
      // oxlint-disable-next-line no-await-in-loop -- waits for the verdict before the next circuit
      const v = await settled(who, pending.circuit, seq, null, base.signal);
      if (v.status === "valid") earlier += 1;
      log(`${pending.circuit}: an earlier upload ended ${v.status}`);
      // oxlint-disable-next-line no-await-in-loop -- lets the queue catch up
      await sleep(RESULT_POLL_MS, base.signal);
      continue;
    }
    const next = view.slot.circuits.find((c) => c.status === "todo");
    if (!next) break;
    if (view.phase !== "OPEN") {
      // oxlint-disable-next-line no-await-in-loop -- the slot is frozen until the operator resumes
      await sleep(WAIT_POLL_MS, base.signal);
      continue;
    }
    const { circuit } = next;
    if (accepted.has(circuit)) throw new Error(`${circuit}: accepted, yet offered again`);
    const tries = (attempts.get(circuit) ?? 0) + 1;
    if (tries > MAX_ATTEMPTS) throw new Error(`${circuit}: no verdict after ${MAX_ATTEMPTS} tries`);
    attempts.set(circuit, tries);
    const csHash = csHashes.get(circuit);
    if (!csHash) throw new Error(`${circuit}: not a circuit of the announced ceremony`);
    log(`${circuit}: contributing`);
    // oxlint-disable-next-line no-await-in-loop -- one circuit after the other (SPEC §4.1)
    const attempt = await contributeTo({ ...base, who, circuit, csHash, seq });
    if (attempt.verdict === null) {
      log(`${circuit}: ${attempt.why}; trying again`);
    } else if (attempt.verdict.status === "valid") {
      accepted.set(circuit, attempt.summary);
      log(`${circuit}: accepted as #${attempt.summary.index}`);
      continue;
    } else {
      // rejected (one retry, then skipped), ambiguous (retried), infra and stale (the verifier
      // failed or timed out: paused, the attempt given back).
      const { status, reason } = attempt.verdict;
      log(`${circuit}: ${status}${reason ? ` (${reason})` : ""}`);
    }
    // oxlint-disable-next-line no-await-in-loop -- a pause before trying again
    await sleep(WAIT_POLL_MS, base.signal);
  }
  return { contributions: [...accepted.values()], earlier };
}

/**
 * Runs a session; returns what was accepted. The session is ended whatever happens (unless the
 * token itself is refused, which the log says), a run stopped while waiting leaves the queue, and
 * every file it wrote is removed unless `options.work` keeps them.
 */
export async function runContribute(
  options: ContributeOptions,
  log: Log = console.log,
  signal?: AbortSignal,
): Promise<SessionSummary> {
  const who: Contributor = { origin: options.coordinator, token: options.token };
  assertTokenLife(options.token, false);
  const client = options.client ?? (await thisClient());
  const csHashes = await anchoredCsHashes(who, options.announcementSha256);
  if (options.work !== undefined) await ensureDir(options.work);
  const work = await mkdtemp(join(options.work ?? tmpdir(), "orbinum-contribute-"));
  let heart: ReturnType<typeof keepAlive> | undefined;
  let seq: number | undefined;
  let result = { contributions: [] as ContributionSummary[], earlier: 0 };
  let failure: unknown;
  try {
    const slot = await takeSlot(who, log, signal);
    seq = slot.seq;
    heart = keepAlive(who);
    const run = await contributeAll(who, seq, { client, work, signal }, csHashes, heart, log);
    result = { contributions: run.contributions, earlier: slot.earlier + run.earlier };
  } catch (error) {
    failure = error;
  }
  try {
    if (seq !== undefined) {
      // Ended even after a failure (heartbeats go on meanwhile), so it never lapses as a no-show.
      await finish(who);
    } else if (signal?.aborted) {
      log(
        (await leave(who))
          ? "left the queue"
          : "could not leave the queue: leave it in the browser",
      );
    }
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    log(`could not end the session, which will lapse as a no-show: ${why}`);
  } finally {
    heart?.stop();
    if (options.work === undefined) await rm(work, { recursive: true, force: true });
  }
  const total = result.contributions.length + result.earlier;
  if (failure !== undefined && total === 0) throw failure;
  if (failure !== undefined) log(`stopped early: ${(failure as Error).message}`);
  if (seq === undefined || total === 0) {
    throw new Error("the session ended with no contribution accepted");
  }
  const summary: SessionSummary = { seq, ...result };
  if (options.work !== undefined) await writeJson(join(work, `contributions-${seq}.json`), summary);
  return summary;
}

/** `contribute` as the entry point runs it: Ctrl-C ends the session cleanly, a second one exits. */
export const contributeCommand: Command = {
  summary: "Contribute to the ceremony from this machine (the CLI path)",
  usage: CONTRIBUTE_USAGE,
  run: async (argv) => {
    const options = parseContributeOptions(argv);
    const abort = new AbortController();
    const stop = () => {
      if (abort.signal.aborted) process.exit(130);
      console.error("interrupted: ending the session or leaving the queue (again to quit at once)");
      abort.abort();
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    try {
      const summary = await runContribute(options, console.log, abort.signal);
      console.log(`\nsession ${summary.seq}: sign the attestation in the browser`);
      for (const c of summary.contributions) {
        console.log(`  ${c.circuit} #${c.index}  h_k ${c.contributionHash}`);
      }
      if (summary.earlier > 0) {
        console.log(`  and ${summary.earlier} accepted before this run (see the receipt)`);
      }
    } finally {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
    }
  },
};
