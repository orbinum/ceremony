/**
 * Sealing the ceremony (SPEC §2.6, §4.3): core's `checkFinalize` decides, every final file the
 * finals pin must already be in the public bucket with its hash, then the beacon is appended (the
 * `finalized` effect), the finals are kept and the final transcript is published. A sealed
 * ceremony refuses every event after.
 */
import { checkFinalize, type FinalizeRequest } from "@orbinum-ceremony/core";
import { headObject, holds, publicBucket, StorageError } from "../../storage";
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
    const object = await headObject(publicBucket(store.env), key);
    if (!object) problems.push(`${key} is not published`);
    else if (!holds(object, sha256)) problems.push(`${key} differs from its final record`);
  }
  return problems;
}

/** How long a final-file write holds finalization off; every exit releases it sooner. */
const FINAL_WRITE_HOLD_MS = 15 * 60_000;

const FINAL_HOLD = "final:";

/**
 * A final file is about to be written: finalization waits until it lands, so the sealed record and
 * the bucket never disagree. Each write holds on its own. Taken before the write is judged, so a
 * seal that wins sees no hold and the write is then judged as FINALIZED. Kept in SQLite: an
 * evicted object still sees it.
 */
export function holdFinalWrite(store: Store): string {
  const hold = crypto.randomUUID();
  const now = Date.now();
  db.takeHold(store.sql, `${FINAL_HOLD}${hold}`, "", now + FINAL_WRITE_HOLD_MS, now);
  return hold;
}

/** The write that took `hold` ended (another write of the same file keeps its own). */
export function releaseFinalWrite(store: Store, hold: string): void {
  db.releaseHold(store.sql, `${FINAL_HOLD}${hold}`);
}

const writingFinals = (store: Store) => db.anyHoldLive(store.sql, FINAL_HOLD, Date.now());

/** Seals the ceremony with the operator's beacon and finals, or refuses with every problem. */
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
  // The heads awaited I/O: decide again on the ceremony as it is now.
  if (writingFinals(store)) return refuse("busy");
  const r = checked(store, request);
  if (!r.ok) return r;
  await commit(store, r.result.state, r.result.effects, r.beacon, () =>
    db.writeFinals(store.sql, r.finals),
  );
  return done(r.result.effects);
}
