/**
 * A contributor's session from the command line. Anchors the ceremony in its announced
 * `ceremony.json`, waits for the slot (polling every 3 s, inside the 30 s claim window) and claims
 * it, keeps it with heartbeats, and contributes to each circuit in order. The loop follows the
 * queue's own rules: a rejection is retried once then skipped, an ambiguous verdict is retried,
 * `infra` and `stale` pause and come back, a pause waits, and an earlier run's upload still in
 * verification settles first. A run whose token would lapse mid-session hands an unclaimed turn
 * back (a lapsed one would count as a no-show) and keeps a place in line. The session is ended
 * whatever happens (unless the token itself is refused, which the log says), a run stopped while
 * waiting gives its place back, and every file it wrote is removed unless `options.work` keeps
 * them. Progress lines come from validated values only: nothing the coordinator wrote reaches a
 * terminal. The client the records name is this checkout's release version (the root manifest)
 * and commit. The attestation is signed in the browser.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CircuitName, ClientInfo } from "@orbinum-ceremony/core";
import { type Contributor, ensureDir, writeJson } from "../../io";
import { resolveCommit } from "../../tools";
import { type Anchors, anchoredCeremony } from "./anchors";
import { contributeTo } from "./contribute-to";
import { claim, finish, keepAlive, leave, placeOf } from "./coordinator";
import { sleep } from "./retry";
import { settled } from "./settled";
import { assertTokenLife, tokenLastsASession } from "./token";
import type { ContributeOptions, ContributionSummary, SessionSummary } from "./types";

const WAIT_POLL_MS = 3_000;
const SETTLE_PAUSE_MS = 2_000;
const MAX_ATTEMPTS = 4;

type Log = (line: string) => void;

async function thisClient(): Promise<ClientInfo> {
  const root = join(import.meta.dirname, "..", "..", "..", "..", "..");
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

async function takeSlot(who: Contributor, log: Log, signal?: AbortSignal) {
  let shown: number | null = null;
  for (;;) {
    const view = await placeOf(who, signal);
    if (!tokenLastsASession(who.token)) {
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

interface Session {
  who: Contributor;
  seq: number;
  anchors: Anchors;
  client: ClientInfo;
  work: string;
  signal?: AbortSignal;
}

async function contributeAll(session: Session, heart: { lost: () => Error | null }, log: Log) {
  const { who, seq, signal } = session;
  const accepted = new Map<CircuitName, ContributionSummary>();
  const attempts = new Map<CircuitName, number>();
  let earlier = 0;
  for (;;) {
    if (signal?.aborted) throw new Error("interrupted");
    const view = await placeOf(who, signal);
    if (!view.slot || view.slot.seq !== seq) break;
    const lost = heart.lost();
    if (lost) throw lost;
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
      const { status, reason } = attempt.verdict;
      log(`${circuit}: ${status}${reason ? ` (${reason})` : ""}`);
    }
    await sleep(WAIT_POLL_MS, signal);
  }
  return { contributions: [...accepted.values()], earlier };
}

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
