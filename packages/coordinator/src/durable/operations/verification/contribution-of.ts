/**
 * The transcript record of a valid upload received at `at`, built and validated by core before
 * anything is copied. It throws unless the transcript could hold it: inside the acceptance window
 * and before the beacon.
 */
import {
  acceptanceWindow,
  buildContributionRecord,
  type ContributionRecord,
  contributionInputOf,
  contributorOf,
  type Job,
} from "@orbinum-ceremony/core";
import * as db from "../../db";
import { records, type Store } from "../../store";
import type { Valid } from "../types";

export function contributionOf(
  store: Store,
  job: Job,
  valid: Valid,
  at: number,
): ContributionRecord {
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
