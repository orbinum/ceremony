/**
 * Wallet links (SPEC §3.4): single-use nonces and 1 GitHub = 1 wallet, in one synchronous step.
 * The link keeps the nonce and `issued_at` its signature signs, so each record can carry them. A
 * sealed ceremony links nothing more.
 */
import { checkRelink, LINK_RULES, type LinkedIdentity } from "@orbinum-ceremony/core";
import { randomHex } from "../../services";
import * as db from "../db";
import type { Store } from "../store";
import { done, type Outcome, refuse } from "./outcome";

/** Whether the ceremony is sealed: read-only from then on (SPEC §4.3). */
const sealed = (store: Store) => db.readQueue(store.sql)?.phase === "FINALIZED";

/** A fresh nonce (`LINK_RULES.nonceBytes` random bytes, hex) for this identity's link signature. */
export function issueNonce(
  store: Store,
  githubId: number,
): { ok: true; nonce: string; expiresAt: number } | ReturnType<typeof refuse> {
  if (sealed(store)) return refuse("finalized");
  const nonce = randomHex(LINK_RULES.nonceBytes);
  const now = Date.now();
  const expiresAt = now + LINK_RULES.nonceTtlMs;
  db.insertNonce(store.sql, nonce, githubId, now, expiresAt);
  return { ok: true, nonce, expiresAt };
}

/**
 * Binds a wallet whose signature the Worker verified: consumes the payload's nonce, then refuses
 * another wallet for this identity or this wallet for another identity. The same wallet again is
 * a no-op.
 */
export function link(store: Store, id: Omit<LinkedIdentity, "linkedAt">): Outcome {
  if (sealed(store)) return refuse("finalized");
  const now = Date.now();
  if (!db.consumeNonce(store.sql, id.nonce, id.githubId, now)) return refuse("nonce-invalid");
  const current = db.readIdentity(store.sql, id.githubId);
  if (current) {
    const why = checkRelink(current, id.accountKey);
    return why ? refuse(why) : done();
  }
  if (db.walletTaken(store.sql, id.accountKey)) return refuse("wallet-taken");
  db.writeIdentity(store.sql, { ...id, linkedAt: now });
  return done();
}
