/**
 * Whether the object may act under the deployment running it: not configured yet, or configured for
 * that deployment's `CEREMONY_ID`. Its folders and the id on its state records come from the
 * deployment, so an earlier ceremony's object, still woken by its own alarm after the deployment
 * moved on, must neither write into the next ceremony's folder nor chain records stamped with its id.
 */
import * as db from "../db";
import type { Store } from "./types";

export function isBound(store: Store): boolean {
  const setup = db.readSetup(store.sql);
  return !setup || setup.announcement.ceremony_id === store.env.CEREMONY_ID;
}
