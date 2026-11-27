/**
 * Each circuit's contributions form a gap-free chain of files rooted in its genesis: index k at
 * position k, input = previous output, and the client's h_k equal to the verified one.
 */
import type { InitRecord } from "../../../init";
import { contributionsOf } from "../../reads";
import type { Chained } from "../../types";

export function checkCircuitLinks(records: readonly Chained[], init: InitRecord): string[] {
  return init.circuits.flatMap((c) => {
    let previous = c.genesis_sha256;
    return contributionsOf(records, c.name).flatMap((r, i) => {
      const problems: string[] = [];
      if (r.index !== i + 1) problems.push(`${c.name}: index ${r.index} at position ${i + 1}`);
      if (r.input_sha256 !== previous) {
        problems.push(`${c.name} #${r.index}: input is not the previous output`);
      }
      if (r.client_contribution_hash !== r.contribution_hash) {
        problems.push(`${c.name} #${r.index}: client h_k differs from the verified h_k`);
      }
      previous = r.output_sha256;
      return problems;
    });
  });
}
