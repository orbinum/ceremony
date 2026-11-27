/**
 * Links the caller's wallet. The signed payload must name the caller, this ceremony and now, and
 * core verifies the signature with the wallet's own library before any compute is spent in the
 * Durable Object, which then enforces the nonce and 1 GitHub = 1 wallet.
 */
import {
  accountKey,
  checkLink,
  type LinkPayload,
  type Scheme,
  verifyLink,
} from "@orbinum-ceremony/core";
import { ceremony } from "../../durable";
import { fromOutcome, refuse } from "../result";
import type { Caller, Result } from "../types";

export async function linkWallet(
  env: Env,
  caller: Caller,
  request: { scheme: Scheme; payload: LinkPayload; signature: string },
): Promise<Result> {
  const { scheme, payload, signature } = request;
  const why = checkLink(
    payload,
    { ceremonyId: env.CEREMONY_ID, githubId: caller.githubId, githubLogin: caller.login },
    Date.now(),
  );
  if (why) return refuse(why);
  const key = accountKey(scheme, payload.account);
  if (!key) return refuse("malformed", "not an address of this scheme");
  if (!verifyLink(scheme, payload, signature)) return refuse("invalid-signature");
  return fromOutcome(
    await ceremony(env).link({
      ...caller,
      scheme,
      account: payload.account,
      accountKey: key,
      signature,
      nonce: payload.nonce,
      issuedAt: payload.issued_at,
    }),
  );
}
