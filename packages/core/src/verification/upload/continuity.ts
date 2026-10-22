/**
 * Cheap acceptance filter before pairings: an upload must extend the recorded head by exactly one
 * new contribution, leaving every recorded entry untouched. SPEC §2.5 #3.
 */
import { G1_GENERATOR } from "../../formats/bn254";
import type { MpcParams } from "../../formats/mpc";
import { ZKEY_NAME } from "../../primitives/schema";

/** One accepted entry as the transcript recorded it. */
interface RecordedEntry {
  hash: string;
  name: string;
  deltaAfter: string;
}

/** What the chain inside an upload must extend. */
export interface HeadExpectation {
  csHash: string;
  /** Recorded entries 1..k-1, in order. */
  previous: readonly RecordedEntry[];
}

/** Every way an upload can fail to extend the head. */
export const CONTINUITY_FAILURES = [
  "cs-hash-mismatch",
  "wrong-count",
  "prefix-mismatch",
  "name-rewritten",
  "not-a-contribution",
  "bad-name",
  "noop-contribution",
] as const;

/** Why an upload does not extend the head. */
type ContinuityFailure =
  | { reason: "cs-hash-mismatch" }
  | { reason: "wrong-count"; expected: number; actual: number }
  | { reason: "prefix-mismatch"; index: number }
  | { reason: "name-rewritten"; index: number }
  | { reason: "not-a-contribution" }
  | { reason: "bad-name" }
  | { reason: "noop-contribution" };

/** The new entry and its index, or why there is none. */
type ContinuityResult =
  | { ok: true; contribution: MpcParams["entries"][number]; index: number }
  | ({ ok: false } & ContinuityFailure);

/**
 * The upload must carry the circuit's csHash and exactly one more entry than the head. Recorded
 * entries must be unchanged — hash, name (outside h_k) and kind (also outside h_k) — and the new
 * one must be a plain contribution (no beacon parameters) with a printable name that moves δ to a
 * value never seen before (neither the genesis δ nor a recorded one: no-op or cancelled chains).
 */
export function checkContinuity(params: MpcParams, head: HeadExpectation): ContinuityResult {
  if (params.csHash !== head.csHash) return { ok: false, reason: "cs-hash-mismatch" };

  const expected = head.previous.length + 1;
  if (params.entries.length !== expected) {
    return { ok: false, reason: "wrong-count", expected, actual: params.entries.length };
  }

  for (const [i, recorded] of head.previous.entries()) {
    const entry = params.entries[i];
    if (entry?.hash !== recorded.hash || entry.kind !== "contribution") {
      return { ok: false, reason: "prefix-mismatch", index: i + 1 };
    }
    if ((entry.name ?? "") !== recorded.name) {
      return { ok: false, reason: "name-rewritten", index: i + 1 };
    }
  }

  const contribution = params.entries[expected - 1] as MpcParams["entries"][number];
  if (
    contribution.kind !== "contribution" ||
    contribution.numIterationsExp !== undefined ||
    contribution.beaconHash !== undefined
  ) {
    return { ok: false, reason: "not-a-contribution" };
  }
  if (!ZKEY_NAME.test(contribution.name ?? "")) return { ok: false, reason: "bad-name" };

  const seen = new Set([G1_GENERATOR, ...head.previous.map((e) => e.deltaAfter)]);
  if (seen.has(contribution.deltaAfter)) return { ok: false, reason: "noop-contribution" };

  return { ok: true, contribution, index: expected };
}
