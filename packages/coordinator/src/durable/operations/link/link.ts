/**
 * Binds a wallet whose signature the Worker verified, in one synchronous step: consumes the
 * payload's single-use nonce, then refuses a wallet another identity holds (1 GitHub = 1 wallet) or
 * a change of wallet the account may not make now. The same wallet again is a no-op. The link keeps
 * the nonce and `issued_at` its signature signs, so each record can carry them. A sealed ceremony
 * links nothing more.
 */
import { type LinkedIdentity, relinkRefusal } from "@orbinum-ceremony/core";
import * as db from "../../db";
import type { Store } from "../../store";
import { done, refuse } from "../outcome";
import type { Outcome } from "../types";
import { sealed } from "./sealed";
import { standingOf } from "./standing-of";

export function link(store: Store, id: Omit<LinkedIdentity, "linkedAt">): Outcome {
  if (sealed(store)) return refuse("finalized");
  const now = Date.now();
  if (!db.consumeNonce(store.sql, id.nonce, id.githubId, now)) return refuse("nonce-invalid");
  const current = db.readIdentity(store.sql, id.githubId);
  if (current?.accountKey === id.accountKey) return done();
  const why = current && relinkRefusal(standingOf(store, id.githubId));
  if (why) return refuse(why);
  if (db.walletTaken(store.sql, id.accountKey)) return refuse("wallet-taken");
  db.writeIdentity(store.sql, { ...id, linkedAt: now });
  return done();
}
