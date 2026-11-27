/**
 * Re-walk of a final zkey against the transcript: it must embed exactly the recorded contributions,
 * in order and under their recorded names (names are outside h_k, so only this comparison pins
 * them), followed by the sealed beacon, and at least the announced minimum (never below 1). A key
 * with no contribution passes `zkey verify` but its δ comes only from the public beacon: anyone
 * could forge proofs. Returns every problem found; empty means it matches.
 */
import type { MpcParams } from "../../formats/mpc";

export interface FinalExpectation {
  csHash: string;
  contributionHashes: readonly string[];
  contributionNames?: readonly string[];
  minContributions: number;
  beacon: { randomness: string; iterationsExp: number };
}

export function checkFinalEntries(params: MpcParams, expected: FinalExpectation): string[] {
  const problems: string[] = [];
  if (params.csHash !== expected.csHash) problems.push("csHash differs: another circuit");

  const n = expected.contributionHashes.length;
  const min = Number.isSafeInteger(expected.minContributions)
    ? Math.max(1, expected.minContributions)
    : Number.POSITIVE_INFINITY;
  const embedded = params.entries.filter((e) => e.kind === "contribution").length;
  if (Math.min(n, embedded) < min) {
    problems.push(`${Math.min(n, embedded)} contributions: at least ${min} required`);
  }

  if (params.entries.length !== n + 1) {
    problems.push(
      `${params.entries.length} entries, expected ${n + 1} (${n} contributions + beacon)`,
    );
    return problems;
  }
  expected.contributionHashes.forEach((h, i) => {
    const entry = params.entries[i];
    if (entry?.kind !== "contribution") problems.push(`entry ${i + 1} is not a contribution`);
    if (entry?.hash !== h) problems.push(`entry ${i + 1} differs from the transcript`);
    const name = expected.contributionNames?.[i];
    if (name !== undefined && (entry?.name ?? "") !== name) {
      problems.push(`entry ${i + 1} is named differently from the transcript`);
    }
  });

  const last = params.entries[n];
  if (last?.kind !== "beacon") problems.push("last entry is not a beacon");
  if (last?.beaconHash !== expected.beacon.randomness) problems.push("beacon value differs");
  if (last?.numIterationsExp !== expected.beacon.iterationsExp) {
    problems.push("beacon iterations differ");
  }
  return problems;
}
