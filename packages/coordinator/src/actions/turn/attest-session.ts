/**
 * Records the caller's session attestation, which closes the session. The body is validated and
 * its signature verified against the linked wallet's scheme here, with the wallet's own library;
 * the Durable Object then checks the session's records.
 */
import { validateAttestationRequest, verifyAttestation } from "@orbinum-ceremony/core";
import { ceremony } from "../../durable";
import { fromOutcome, refuse } from "../result";
import type { Result } from "../types";

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
