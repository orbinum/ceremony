/**
 * `contribute`: a contributor's session from the command line (SPEC §4.1, §4.4). Anchors the
 * ceremony in its announced `ceremony.json`, waits for the slot and claims it, keeps it with
 * heartbeats, and contributes to each circuit in order (`contribution.ts`). The loop follows the
 * queue's own rules (a rejection is retried once, `infra` and `stale` pause and come back, a pause
 * waits); the session is ended whatever happens, and a run stopped while waiting gives its place
 * in line back. The attestation is signed in the browser.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CircuitName, ClientInfo } from "@orbinum-ceremony/core";
import { type Contributor, ensureDir, writeJson } from "../../io";
import { resolveCommit } from "../../tools";
import type { Command } from "../types";
import { type Anchors, anchoredCeremony } from "./anchors";
import { claim, finish, keepAlive, leave, placeOf } from "./api";
import { type ContributionSummary, contributeTo, settled } from "./contribution";
import { CONTRIBUTE_USAGE, type ContributeOptions, parseContributeOptions } from "./options";
import { sleep } from "./retry";
import { assertTokenLife, tokenLastsASession } from "./token";

/** How often the place in line is polled while waiting (the claim window is 30 s). */
const WAIT_POLL_MS = 3_000;
/** A pause after an earlier upload settles, so the queue catches up. */
const SETTLE_PAUSE_MS = 2_000;
/** Contributions to one circuit in one run: two rejections end it, retries are bounded. */
const MAX_ATTEMPTS = 4;

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

/**
 * Waits in line until the slot is this contributor's, then claims it. Returns its seq and how many
 * of its circuits were accepted before this run (a restarted run).
 */
async function takeSlot(who: Contributor, log: Log, signal?: AbortSignal) {
  let shown: number | null = null;
  for (;;) {
    const view = await placeOf(who, signal);
    if (!tokenLastsASession(who.token)) {
      // A turn it could not finish is handed back unclaimed, which costs nothing (a lapsed one
      // would count as a no-show); a place in line is simply kept.
      if (view.slot && !view.slot.claimed) await leave(who);
      assertTokenLife(who.token, view.slot === null);
    }
    if (view.slot) {
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
    await sleep(WAIT_POLL_MS, signal);
  }
}

/** What every contribution of the session shares. */
interface Session {
  who: Contributor;
  seq: number;
  anchors: Anchors;
  client: ClientInfo;
  work: string;
  signal?: AbortSignal;
}

/**
 * The contributions of the slot, circuit by circuit, until none is left to do. Returns this run's
 * accepted ones and how many earlier uploads it saw settle as accepted.
 */
async function contributeAll(session: Session, heart: { lost: () => Error | null }, log: Log) {
  const { who, seq, signal } = session;
  const accepted = new Map<CircuitName, ContributionSummary>();
  const attempts = new Map<CircuitName, number>();
  let earlier = 0;
  for (;;) {
    if (signal?.aborted) throw new Error("interrupted");
    const view = await placeOf(who, signal);
    // A session whose every circuit is done closes itself (a heartbeat refused then is fine).
    if (!view.slot || view.slot.seq !== seq) break;
    const lost = heart.lost();
    if (lost) throw lost;
    // An upload of an earlier run still in verification: let it settle before going on.
    const pending = view.slot.circuits.find((c) => c.status === "verifying");
    if (pending) {
      const v = await settled(who, pending.circuit, seq, null, signal);
      if (v.status === "valid") earlier += 1;
      log(`${pending.circuit}: an earlier upload ended ${v.status}`);
      await sleep(SETTLE_PAUSE_MS, signal);
      continue;
    }
    const next = view.slot.circuits.find((c) => c.status === "todo");
    if (!next) break;
    if (view.phase !== "OPEN") {
      await sleep(WAIT_POLL_MS, signal);
      continue;
    }
    const { circuit } = next;
    if (accepted.has(circuit)) throw new Error(`${circuit}: accepted, yet offered again`);
    const tries = (attempts.get(circuit) ?? 0) + 1;
    if (tries > MAX_ATTEMPTS) throw new Error(`${circuit}: no verdict after ${MAX_ATTEMPTS} tries`);
    attempts.set(circuit, tries);
    const csHash = session.anchors.csHashes.get(circuit);
    if (!csHash) throw new Error(`${circuit}: not a circuit of the announced ceremony`);
    log(`${circuit}: contributing`);
    const attempt = await contributeTo({ ...session, circuit, csHash });
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
    await sleep(WAIT_POLL_MS, signal);
  }
  return { contributions: [...accepted.values()], earlier };
}

/**
 * Ends what the run started: the session (heartbeats go on meanwhile, so it never lapses as a
 * no-show), or the place in line of a run stopped while waiting.
 */
async function endRun(who: Contributor, seq: number | undefined, log: Log, signal?: AbortSignal) {
  try {
    if (seq !== undefined) await finish(who);
    else if (signal?.aborted) {
      log(
        (await leave(who))
          ? "left the queue"
          : "could not leave the queue: leave it in the browser",
      );
    }
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    log(`could not end the session, which will lapse as a no-show: ${why}`);
  }
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
  const anchors = await anchoredCeremony(who, options.announcementSha256);
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
    const run = await contributeAll({ who, seq, anchors, client, work, signal }, heart, log);
    result = { contributions: run.contributions, earlier: slot.earlier + run.earlier };
  } catch (error) {
    failure = error;
  }
  try {
    await endRun(who, seq, log, signal);
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
