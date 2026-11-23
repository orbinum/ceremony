/**
 * Wallet signatures (SPEC §3.4–3.5): a link proves control of the wallet before any compute is
 * spent, an attestation closes a session. Core verifies the signatures (with the wallets' own
 * libraries); the Durable Object then enforces nonces, uniqueness and the session's records.
 */
import {
  accountKey,
  checkLink,
  type LinkPayload,
  type Scheme,
  validateAttestationRequest,
  verifyAttestation,
  verifyLink,
} from "@orbinum-ceremony/core";
import { ceremony } from "../durable";
import { fromOutcome, refuse, type Result } from "./result";

/** Who is calling, as the session established. */
export interface Caller {
  githubId: number;
  login: string;
}

/** Links the caller's wallet: the signed payload must name them, this ceremony and now. */
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

/** The caller's linked wallet, as the client shows it. */
export async function linkedWallet(env: Env, caller: Caller) {
  const stub = ceremony(env);
  const [linked, changeRefusal] = await Promise.all([
    stub.linked(caller.githubId),
    stub.changeRefusal(caller.githubId),
  ]);
  return {
    ceremonyId: env.CEREMONY_ID,
    githubId: caller.githubId,
    login: caller.login,
    linked: linked && {
      scheme: linked.scheme,
      account: linked.account,
      linkedAt: linked.linkedAt,
      // Why the wallet cannot be changed now (null: it can be).
      changeRefusal,
    },
  };
}

/** Records the caller's session attestation, signed by their linked wallet. */
export async function attestSession(env: Env, githubId: number, body: unknown): Promise<Result> {
  const stub = ceremony(env);
  const linked = await stub.linked(githubId);
  if (!linked) return refuse("not-linked");
  let request;
  try {
    request = validateAttestationRequest(body, linked.scheme);
  } catch {
    return refuse("malformed");
  }
  const { payload, signature } = request;
  if (!verifyAttestation(linked.scheme, payload, signature)) return refuse("invalid-signature");
  return fromOutcome(await stub.attest(githubId, payload, signature));
}
