/** A fresh single-use nonce (`LINK_RULES.nonceBytes` random bytes, hex) for an identity's link signature. */
import { LINK_RULES } from "@orbinum-ceremony/core";
import { randomHex } from "../../../services";
import * as db from "../../db";
import type { Store } from "../../store";
import { refuse } from "../outcome";
import { sealed } from "./sealed";

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
