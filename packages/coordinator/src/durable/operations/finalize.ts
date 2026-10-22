/**
 * Sealing the ceremony (SPEC §2.6, §4.3): core's `checkFinalize` decides, every final file the
 * finals pin must already be in the public bucket with its hash, then the beacon is appended (the
 * `finalized` effect), the finals are kept and the final transcript is published. A sealed
 * ceremony refuses every event after.
 */
import { checkFinalize, type FinalizeRequest } from "@orbinum-ceremony/core";
import { headObject, holds, StorageError } from "../../storage";
import * as db from "../db";
import { commit, records, type Store } from "../store";
import { queueNow } from "./clock";
import { done, type Outcome, refuse } from "./outcome";

const checked = (store: Store, request: FinalizeRequest) => {
  const setup = db.readSetup(store.sql);
  const state = db.readQueue(store.sql);
  if (!setup || !state) return refuse("not-configured");
  return checkFinalize(setup, state, records(store), request, queueNow(store));
};

/** The final files that are not published with the hash their final record pins. */
async function unpublished(store: Store, files: { key: string; sha256: string }[]) {
  const problems: string[] = [];
  for (const { key, sha256 } of files) {
    // oxlint-disable-next-line no-await-in-loop -- a few heads
    const object = await headObject(store.env.PUBLIC, key);
    if (!object) problems.push(`${key} is not published`);
    else if (!holds(object, sha256)) problems.push(`${key} differs from its final record`);
  }
  return problems;
}

/** Seals the ceremony with the operator's beacon and finals, or refuses with every problem. */
export async function finalize(store: Store, request: FinalizeRequest): Promise<Outcome> {
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
  // The heads awaited I/O: decide again on the ceremony as it is now.
  const r = checked(store, request);
  if (!r.ok) return r;
  await commit(store, r.result.state, r.result.effects, r.beacon, () =>
    db.writeFinals(store.sql, r.finals),
  );
  return done(r.result.effects);
}
