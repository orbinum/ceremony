/**
 * Applies a verifier report, idempotently by job. Only the slot's current verification is applied,
 * judged at receipt: the clock is advanced first, so a result after the verify deadline finds the
 * job stale and changes nothing (a timeout never turns into an accepted contribution), while one
 * received in time is not lost to the time its copy takes. A valid result the transcript cannot
 * hold is the verifier's fault, not the contributor's: `infra`. A valid upload is copied to its
 * public path before its record is appended, by one writer per public index (a retry while a copy
 * is in flight gets `storage` and comes back, as does any other report on that index, so none can
 * settle the job under the copy and unpublish it), and the job is read again after the copy since a
 * deadline may have run past the clock's hold. A storage failure leaves the job pending for the
 * verifier to retry. A copy the transcript ends up not recording is removed, checked against the
 * records, so a commit that failed after writing them keeps its copies.
 */
import {
  type ContributionRecord,
  type Job,
  reconcileReport,
  type VerificationResult,
  type VerifierReport,
} from "@orbinum-ceremony/core";
import { StorageError } from "../../../storage";
import * as db from "../../db";
import { indexOf, type Store, unpublishUnrecorded } from "../../store";
import { tick } from "../clock";
import { refuse } from "../outcome";
import type { Applied } from "../types";
import { contributionOf } from "./contribution-of";
import { promote } from "./promote";
import { settle } from "./settle";

export async function report(store: Store, incoming: VerifierReport): Promise<Applied> {
  if (!db.readJob(store.sql, incoming.job)) return refuse("unknown-job");
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
      console.error(error);
      outcome = "infra";
    }
  }
  const index = indexOf(job);
  if (store.promoting.has(index)) return refuse("storage");
  if (!contribution || incoming.result !== "valid") {
    return settle(store, job, incoming, outcome, at);
  }

  store.promoting.add(index);
  store.receivedAt.set(index, at);
  let committed = false;
  try {
    await promote(store, job, incoming);
    const now = db.readJob(store.sql, incoming.job) as Job;
    if (now.status !== "pending") return { ok: true, status: "stale" };
    const r = await settle(store, now, incoming, outcome, at, contribution);
    committed = r.ok;
    return r;
  } catch (error) {
    if (!(error instanceof StorageError)) throw error;
    console.error(error);
    return refuse("storage");
  } finally {
    store.receivedAt.delete(index);
    if (!committed) await unpublishUnrecorded(store, job);
    store.promoting.delete(index);
  }
}
