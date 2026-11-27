/**
 * Why a signed attestation cannot be recorded, or null: it must be this ceremony's, by the linked
 * identity and account, cover exactly the session's accepted records, and come once.
 */
import { type AttestationPayload, attestedContributionsOf, type Chained } from "../../ceremony";
import { canonicalJson } from "../../primitives/hashing";

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
