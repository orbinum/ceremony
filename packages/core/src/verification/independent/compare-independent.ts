/**
 * Every way an independent verdict disagrees with the transcript's accepted chain for one circuit
 * and with that circuit's csHash in init.json.
 */
import type { IndependentVerdict } from "./types";

export function compareIndependent(
  verdict: IndependentVerdict,
  recorded: readonly string[],
  csHash: string,
): string[] {
  const problems: string[] = [];
  const contributions = verdict.entries.filter((e) => e.kind === "contribution").map((e) => e.hash);
  if (contributions.length !== recorded.length || contributions.some((h, i) => h !== recorded[i])) {
    problems.push("its h_k chain differs from the transcript");
  }
  if (verdict.csHash !== csHash) problems.push("its csHash differs from init.json");
  return problems;
}
