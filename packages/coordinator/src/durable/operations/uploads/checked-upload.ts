/**
 * Core's `checkUpload` on the ceremony as it is now, asked before an upload's bytes move and again
 * once they are stored (the turn may have moved on meanwhile).
 */
import { checkUpload, type UploadRequest } from "@orbinum-ceremony/core";
import * as db from "../../db";
import { records, type Store } from "../../store";
import { queueNow } from "../clock";
import { refuse } from "../outcome";

export const checkedUpload = (store: Store, upload: UploadRequest) => {
  const setup = db.readSetup(store.sql);
  const state = db.readQueue(store.sql);
  if (!setup || !state) return refuse("not-configured");
  return checkUpload(setup, state, records(store), upload, queueNow(store));
};
