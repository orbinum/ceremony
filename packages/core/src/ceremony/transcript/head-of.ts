/**
 * The head an upload of a circuit must extend, derived from the transcript. It trusts record
 * order; `checkCircuitLinks` is what proves that order is a gap-free chain.
 */
import type { CircuitName } from "../../config";
import type { CurrentHead } from "../../verification";
import { contributionsOf } from "./contributions-of";
import type { Chained } from "./types";

export function headOf(
  records: readonly Chained[],
  circuit: CircuitName,
  genesis: { sha256: string; csHash: string },
): CurrentHead & { index: number } {
  const accepted = contributionsOf(records, circuit);
  return {
    index: accepted.length,
    outputSha256: accepted.at(-1)?.output_sha256 ?? genesis.sha256,
    csHash: genesis.csHash,
    previous: accepted.map((r) => ({
      hash: r.contribution_hash,
      name: r.zkey_name,
      deltaAfter: r.delta_after,
    })),
  };
}
