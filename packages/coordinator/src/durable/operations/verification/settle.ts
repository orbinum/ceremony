/**
 * Applies the verifier's outcome for a job as of `at` (its receipt), with the record of an
 * acceptance, in one commit with the job's final status; then drops the private upload.
 */
import {
  type ContributionRecord,
  type Job,
  step,
  storedReport,
  type VerificationResult,
  type VerifierReport,
} from "@orbinum-ceremony/core";
import { deleteQuietly, privateBucket } from "../../../storage";
import * as db from "../../db";
import { commit, type Store } from "../../store";
import { refuse } from "../outcome";
import type { Applied } from "../types";

export async function settle(
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
  await deleteQuietly(privateBucket(store.env), job.key);
  return { ok: true, status: "applied" };
}
