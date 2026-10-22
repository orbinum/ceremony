/**
 * Building and checking the payloads wallets sign, against what the coordinator knows: the
 * session's identity, the clock, and the accepted records. SPEC §3.4–3.5.
 */
import { LINK_RULES } from "../../config";
import {
  type AttestationPayload,
  attestedContributionsOf,
  type Chained,
  type ClientInfo,
  type LinkPayload,
} from "../../ceremony";
import { canonicalJson } from "../../primitives/hashing";

/** A link payload for the identity the session vouches for, issued now (epoch ms). */
export const buildLinkPayload = (input: {
  ceremonyId: string;
  githubId: number;
  githubLogin: string;
  account: string;
  nonce: string;
  now: number;
}): LinkPayload => ({
  ceremony_id: input.ceremonyId,
  github_id: input.githubId,
  github_login: input.githubLogin,
  account: input.account,
  nonce: input.nonce,
  issued_at: Math.floor(input.now / 1000),
});

/** Why a signed link payload does not belong to this session, or null if it does. */
export function checkLink(
  payload: LinkPayload,
  session: { ceremonyId: string; githubId: number; githubLogin: string },
  now: number,
): "wrong-identity" | "stale-signature" | null {
  if (
    payload.ceremony_id !== session.ceremonyId ||
    payload.github_id !== session.githubId ||
    payload.github_login !== session.githubLogin
  ) {
    return "wrong-identity";
  }
  return Math.abs(now / 1000 - payload.issued_at) > LINK_RULES.maxSkewS ? "stale-signature" : null;
}

/** The attestation payload a contributor signs at the end of session `seq`. */
export const buildAttestationPayload = (input: {
  ceremonyId: string;
  githubId: number;
  account: string;
  seq: number;
  records: readonly Chained[];
  client: ClientInfo;
}): AttestationPayload => ({
  ceremony_id: input.ceremonyId,
  github_id: input.githubId,
  account: input.account,
  seq: input.seq,
  contributions: attestedContributionsOf(input.records, input.seq, input.githubId),
  client: input.client,
});

/**
 * Why a signed attestation cannot be recorded, or null: it must be this ceremony's, by the
 * linked identity and account, cover exactly the session's accepted records, and come once.
 */
export function checkAttestation(
  payload: AttestationPayload,
  linked: { ceremonyId: string; githubId: number; account: string },
  records: readonly Chained[],
): "attestation-mismatch" | "already-attested" | null {
  if (
    payload.ceremony_id !== linked.ceremonyId ||
    payload.github_id !== linked.githubId ||
    payload.account !== linked.account
  ) {
    return "attestation-mismatch";
  }
  if (records.some((r) => r.type === "attestation" && r.seq === payload.seq)) {
    return "already-attested";
  }
  const accepted = attestedContributionsOf(records, payload.seq, linked.githubId);
  if (accepted.length === 0 || canonicalJson(accepted) !== canonicalJson(payload.contributions)) {
    return "attestation-mismatch";
  }
  return null;
}
