/**
 * The accepted contributions of one session by one GitHub account, in transcript order and by
 * hashes only: exactly what that session's attestation must cover.
 */
import type { AttestedContribution } from "../identity";
import type { Chained, ContributionRecord } from "./types";

export function attestedContributionsOf(
  records: readonly Chained[],
  seq: number,
  githubId: number,
): AttestedContribution[] {
  return records
    .filter(
      (r): r is Chained<ContributionRecord> =>
        r.type === "contribution" && r.seq === seq && r.identity?.github_id === githubId,
    )
    .map((r) => ({
      circuit: r.circuit,
      index: r.index,
      input_sha256: r.input_sha256,
      output_sha256: r.output_sha256,
      contribution_hash: r.contribution_hash,
    }));
}
