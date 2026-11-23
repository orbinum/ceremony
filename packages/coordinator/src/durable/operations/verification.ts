/**
 * Verifier results (SPEC §2.5, §4.2). Only the slot's current verification is applied, judged at
 * receipt: a result after the verify deadline finds the job stale and changes nothing, so a
 * timeout never turns into an accepted contribution, while one received in time is not lost to
 * the time its copy takes. A valid upload is copied to its public path before its record is
 * appended; the record is the authority over that path, so what an unrecorded index holds is a
 * leftover, replaced, and a copy the transcript ends up not recording is removed.
 */
import {
  acceptanceWindow,
  buildContributionRecord,
  CEREMONY_LAYOUT,
  type CeremonyRefusal,
  type ContributionRecord,
  contentTypeOf,
  contributionInputOf,
  contributorOf,
  type Job,
  reconcileReport,
  step,
  storedReport,
  type VerificationResult,
  type VerifierReport,
} from "@orbinum-ceremony/core";
import { deleteQuietly, getObject, replaceObject, StorageError } from "../../storage";
import * as db from "../db";
import { commit, indexOf, isRecorded, records, type Store, unpublishUnrecorded } from "../store";
import { tick } from "./clock";
import { refuse } from "./outcome";

type Valid = Extract<VerifierReport, { result: "valid" }>;
type Applied =
  | { ok: true; status: "applied" | "stale" | "duplicate" }
  | { ok: false; refusal: CeremonyRefusal };

/**
 * The record of a valid upload received at `at`, built and validated by core before anything is
 * copied; it throws unless the transcript could hold it (inside the acceptance window, before
 * the beacon).
 */
function contributionOf(store: Store, job: Job, valid: Valid, at: number): ContributionRecord {
  const setup = db.readSetup(store.sql);
  const window = setup && acceptanceWindow(setup.announcement);
  if (!window || at < window.from || at > window.to) {
    throw new Error(`${job.circuit} #${job.index}: received outside the acceptance window`);
  }
  if (records(store).some((r) => r.type === "beacon")) {
    throw new Error(`${job.circuit} #${job.index}: the beacon is sealed`);
  }
  const linked = db.readIdentity(store.sql, job.githubId);
  return buildContributionRecord(
    contributionInputOf({
      ceremonyId: store.env.CEREMONY_ID,
      job,
      report: valid,
      contributor: linked && contributorOf(linked),
      at: new Date(at).toISOString(),
    }),
  );
}

/**
 * Copies an accepted upload and its log to their public paths (R2 checks both SHA-256s), over
 * any leftover: the index is not recorded (its record would be the head this job extends).
 */
async function promote(store: Store, job: Job, valid: Valid): Promise<void> {
  if (isRecorded(store, job)) {
    throw new Error(`promote: ${job.circuit} #${job.index} is already recorded`);
  }
  const { PUBLIC, PRIVATE } = store.env;
  const logKey = CEREMONY_LAYOUT.log(job.circuit, job.index);
  await replaceObject(PUBLIC, logKey, valid.log, valid.logSha256, contentTypeOf(logKey));
  const object = await getObject(PRIVATE, job.key);
  if (!object) throw new Error(`promote: ${job.key} is missing`);
  const zkeyKey = CEREMONY_LAYOUT.zkey(job.circuit, job.index);
  await replaceObject(PUBLIC, zkeyKey, object.body, job.claim.outputSha256, contentTypeOf(zkeyKey));
}

/** Applies the verifier's outcome as of `at` (its receipt), and the record of an acceptance. */
async function settle(
  store: Store,
  job: Job,
  incoming: VerifierReport,
  outcome: VerificationResult["result"],
  at: number,
  contribution?: ContributionRecord,
): Promise<Applied> {
  const state = db.readQueue(store.sql);
  if (!state) return refuse("not-configured");
  const result = step(
    state,
    { type: "verified", seq: job.seq, circuit: job.circuit, attempt: job.attempt, outcome },
    at,
  );
  if (!result.ok) return refuse(result.refusal);
  await commit(store, result.state, result.effects, contribution, () =>
    db.writeJob(store.sql, { ...job, status: "done", outcome, report: storedReport(incoming) }),
  );
  await deleteQuietly(store.env.PRIVATE, job.key);
  return { ok: true, status: "applied" };
}

/** Applies a verifier report, idempotently by job. */
export async function report(store: Store, incoming: VerifierReport): Promise<Applied> {
  if (!db.readJob(store.sql, incoming.job)) return refuse("unknown-job");
  // Received now: the tick's own commit (its publication) must not make a timely result late.
  const at = Date.now();
  await tick(store);
  const job = db.readJob(store.sql, incoming.job) as Job;
  if (job.status === "stale") return { ok: true, status: "stale" };
  if (job.status === "done") return { ok: true, status: "duplicate" };

  let outcome: VerificationResult["result"] = reconcileReport(job, incoming);
  let contribution: ContributionRecord | undefined;
  if (outcome === "valid" && incoming.result === "valid") {
    try {
      contribution = contributionOf(store, job, incoming, at);
    } catch (error) {
      // A valid result the transcript cannot hold is the verifier's fault, not the contributor's.
      console.error(error);
      outcome = "infra";
    }
  }
  if (!contribution || incoming.result !== "valid") {
    return settle(store, job, incoming, outcome, at);
  }

  // One writer per public index; a retry while a copy is in flight is told to come back.
  const index = indexOf(job);
  if (store.promoting.has(index)) return refuse("storage");
  store.promoting.add(index);
  store.receivedAt.set(index, at);
  let committed = false;
  try {
    await promote(store, job, incoming);
    // Past the clock's hold, a deadline may have run meanwhile.
    const now = db.readJob(store.sql, incoming.job) as Job;
    if (now.status !== "pending") return { ok: true, status: "stale" };
    const r = await settle(store, now, incoming, outcome, at, contribution);
    committed = r.ok;
    return r;
  } catch (error) {
    // The job stays pending: the verifier retries (a storage refusal is a 503).
    if (!(error instanceof StorageError)) throw error;
    console.error(error);
    return refuse("storage");
  } finally {
    store.receivedAt.delete(index);
    // Nobody may download a copy the transcript does not record (checked against the records, so
    // a commit that failed after writing them keeps its copies).
    if (!committed) await unpublishUnrecorded(store, job);
    store.promoting.delete(index);
  }
}
