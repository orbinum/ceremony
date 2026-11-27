/**
 * Seals the ceremony with the operator's beacon and finals, or refuses with every problem: core's
 * `checkFinalize` decides, every final file the finals pin must already be in the public bucket
 * with its hash, and no final-file write may be in flight. The heads await I/O, so the decision is
 * taken again on the ceremony as it is then; the beacon is appended (the `finalized` effect), the
 * finals are kept and the final transcript is published. A sealed ceremony refuses every event
 * after.
 */
import { checkFinalize, type FinalizeRequest } from "@orbinum-ceremony/core";
import { headObject, holds, publicBucket, StorageError } from "../../../storage";
import * as db from "../../db";
import { commit, records, type Store } from "../../store";
import { queueNow } from "../clock";
import { done, refuse } from "../outcome";
import type { Outcome } from "../types";
import { writingFinals } from "./final-write-hold";

const checked = (store: Store, request: FinalizeRequest) => {
  const setup = db.readSetup(store.sql);
  const state = db.readQueue(store.sql);
  if (!setup || !state) return refuse("not-configured");
  return checkFinalize(setup, state, records(store), request, queueNow(store));
};

async function unpublished(store: Store, files: { key: string; sha256: string }[]) {
  const problems: string[] = [];
  for (const { key, sha256 } of files) {
    // oxlint-disable-next-line no-await-in-loop
    const object = await headObject(publicBucket(store.env), key);
    if (!object) problems.push(`${key} is not published`);
    else if (!holds(object, sha256)) problems.push(`${key} differs from its final record`);
  }
  return problems;
}

export async function finalize(store: Store, request: FinalizeRequest): Promise<Outcome> {
  if (writingFinals(store)) return refuse("busy");
  const first = checked(store, request);
  if (!first.ok) return first;
  let problems: string[];
  try {
    problems = await unpublished(store, first.files);
  } catch (error) {
    if (!(error instanceof StorageError)) throw error;
    console.error(error);
    return refuse("storage");
  }
  if (problems.length > 0) return refuse("not-finalizable", problems);
  if (writingFinals(store)) return refuse("busy");
  const r = checked(store, request);
  if (!r.ok) return r;
  await commit(store, r.result.state, r.result.effects, r.beacon, () =>
    db.writeFinals(store.sql, r.finals),
  );
  return done(r.result.effects);
}
