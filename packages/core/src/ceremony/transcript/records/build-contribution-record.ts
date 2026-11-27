/**
 * Builds a validated contribution record from what the contributor claimed and the verifier
 * established; throws `FormatError` on any field out of bounds. Every record any component writes
 * is built and validated by one of these constructors.
 */
import { normalizeSignature } from "../../../primitives/encoding";
import type { ContributionInput, ContributionRecord } from "../types";
import { validateRecord } from "../validate";

export function buildContributionRecord(input: ContributionInput): ContributionRecord {
  const { claimed, verified, contributor } = input;
  return validateRecord({
    type: "contribution",
    ceremony_id: input.ceremonyId,
    seq: input.seq,
    circuit: input.circuit,
    index: input.index,
    input_sha256: claimed.inputSha256,
    output_sha256: claimed.outputSha256,
    contribution_hash: verified.contributionHash,
    client_contribution_hash: claimed.contributionHash,
    zkey_name: verified.zkeyName,
    delta_after: verified.deltaAfter,
    method: claimed.method,
    client: claimed.client,
    identity: contributor && {
      github_id: contributor.github_id,
      github_login: contributor.github_login,
      account: contributor.account,
      scheme: contributor.scheme,
      nonce: contributor.nonce,
      issued_at: contributor.issued_at,
    },
    link_sig: contributor && normalizeSignature(contributor.linkSignature),
    gist_url: null,
    verified_by: {
      verifier_version: verified.verifierVersion,
      snarkjs_version: verified.snarkjsVersion,
      at: input.at,
    },
    verifier_log_sha256: verified.logSha256,
  } satisfies ContributionRecord) as ContributionRecord;
}
