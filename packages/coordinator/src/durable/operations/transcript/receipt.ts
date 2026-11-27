/** A session's receipt: its records, each with its chain value, and the anchor. */
import { type Receipt, receiptOf, transcriptOf } from "@orbinum-ceremony/core";
import * as db from "../../db";
import { records, type Store } from "../../store";

export function receipt(store: Store, seq: number): Receipt | null {
  const setup = db.readSetup(store.sql);
  if (!setup) return null;
  const { ceremony_id: id } = setup.announcement;
  return receiptOf(transcriptOf(id, setup.announcementSha256, records(store)), seq);
}
