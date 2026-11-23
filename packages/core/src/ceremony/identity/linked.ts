/**
 * A wallet bound to a GitHub identity, the link it signed, and the requests that bind it or sign
 * with it. SPEC §3.4–3.5.
 */
import { asOneOf, asRecord } from "../../primitives/schema";
import { asWalletSignature } from "./account";
import type { AttestationPayload, Identity, LinkPayload, Scheme } from "./types";
import { SCHEMES } from "./types";
import { validateAttestationPayload, validateLinkPayload } from "./validate";

/** A wallet bound to a GitHub identity by its link signature. */
export interface LinkedIdentity {
  githubId: number;
  login: string;
  scheme: Scheme;
  account: string;
  /** Canonical form of the account (lowercase EVM address, sr25519 public key). */
  accountKey: string;
  /** The link signature, and the nonce and `issued_at` of the payload it signs. */
  signature: string;
  nonce: string;
  issuedAt: number;
  linkedAt: number;
}

/** The contributor a transcript record names for a linked identity. */
export const contributorOf = (linked: LinkedIdentity): Identity & { linkSignature: string } => ({
  github_id: linked.githubId,
  github_login: linked.login,
  account: linked.account,
  scheme: linked.scheme,
  nonce: linked.nonce,
  issued_at: linked.issuedAt,
  linkSignature: linked.signature,
});

/** The exact payload a recorded identity's link signature signs. SPEC §3.4. */
export const linkPayloadOf = (ceremonyId: string, identity: Identity): LinkPayload => ({
  ceremony_id: ceremonyId,
  github_id: identity.github_id,
  github_login: identity.github_login,
  account: identity.account,
  nonce: identity.nonce,
  issued_at: identity.issued_at,
});

/** Where a linked GitHub account stands when it asks to link another wallet. */
export interface RelinkStanding {
  /** A contribution in the transcript names it (and so its wallet). */
  contributed: boolean;
  /** It holds the session in progress. */
  inTurn: boolean;
}

/**
 * Why a linked account may not change its wallet now, or null. One wallet per GitHub account at
 * any time, and across the whole transcript (`verify` checks it): the wallet is fixed once a
 * contribution names it, and does not change during the account's own session (its attestation
 * is signed by the wallet its contributions name).
 */
export const relinkRefusal = (standing: RelinkStanding): "already-linked" | "busy" | null =>
  standing.contributed ? "already-linked" : standing.inTurn ? "busy" : null;

/** `POST /api/link`: the scheme, the signed payload and its signature, nothing else. */
export function validateLinkRequest(body: unknown): {
  scheme: Scheme;
  payload: LinkPayload;
  signature: string;
} {
  const o = asRecord(body, "link", ["scheme", "payload", "signature"]);
  const scheme = asOneOf(o.scheme, "link.scheme", SCHEMES);
  return {
    scheme,
    payload: validateLinkPayload(o.payload, scheme, "link.payload"),
    signature: asWalletSignature(o.signature, "link.signature", scheme),
  };
}

/** `POST /api/session/attest`: the payload and its signature by the linked wallet's scheme. */
export function validateAttestationRequest(
  body: unknown,
  scheme: Scheme,
): { payload: AttestationPayload; signature: string } {
  const o = asRecord(body, "attestation", ["payload", "signature"]);
  return {
    payload: validateAttestationPayload(o.payload, scheme, "attestation.payload"),
    signature: asWalletSignature(o.signature, "attestation.signature", scheme),
  };
}
