/**
 * Spends a sign-in's OAuth state, so it completes one sign-in only; false if it completed already
 * (a copied cookie). Kept only while the state could still be accepted.
 */
import { SESSION_RULES } from "@orbinum-ceremony/core";
import * as db from "../../db";
import type { Store } from "../../store";

export function spendOAuthState(store: Store, state: string): boolean {
  const now = Date.now();
  return db.spendOnce(store.sql, `oauth:${state}`, now, now + SESSION_RULES.oauthStateTtlMs);
}
