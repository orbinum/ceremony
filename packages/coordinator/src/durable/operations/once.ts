/**
 * Single use: an OAuth state completes one sign-in, a request MAC authenticates one request. Each
 * is kept only while it could still be accepted.
 */
import { REQUEST_AUTH, SESSION_RULES } from "@orbinum-ceremony/core";
import * as db from "../db";
import type { Store } from "../store";

/** Spends a sign-in's OAuth state; false if it completed already (a copied cookie). */
export function spendOAuthState(store: Store, state: string): boolean {
  const now = Date.now();
  return db.spendOnce(store.sql, `oauth:${state}`, now, now + SESSION_RULES.oauthStateTtlMs);
}

/**
 * Spends a verifier request's MAC, signed at `timestamp`; false if it was seen already (a replay
 * inside the freshness window). The verifier signs every try anew, so a retry is never refused.
 */
export function spendRequestMac(store: Store, signature: string, timestamp: number): boolean {
  return db.spendOnce(
    store.sql,
    `mac:${signature}`,
    Date.now(),
    timestamp + REQUEST_AUTH.skewMs + 1,
  );
}
