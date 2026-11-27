/**
 * Spends a verifier request's MAC, signed at `timestamp`, so it authenticates one request only;
 * false if it was seen already (a replay inside the freshness window). Kept only while it could
 * still be accepted. The verifier signs every try anew, so a retry is never refused.
 */
import { REQUEST_AUTH } from "@orbinum-ceremony/core";
import * as db from "../../db";
import type { Store } from "../../store";

export function spendRequestMac(store: Store, signature: string, timestamp: number): boolean {
  return db.spendOnce(
    store.sql,
    `mac:${signature}`,
    Date.now(),
    timestamp + REQUEST_AUTH.skewMs + 1,
  );
}
