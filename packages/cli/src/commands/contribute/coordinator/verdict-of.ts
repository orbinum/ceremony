/** `GET /api/session/result/:circuit`, retried and validated; null before this identity's first upload. */
import {
  asOneOf,
  asSafeInt,
  type CircuitName,
  CONTRIBUTOR_PATHS,
  normalizeHex,
  REJECT_REASONS,
} from "@orbinum-ceremony/core";
import { type Contributor, contributorCall } from "../../../io";
import { refusedWith, retrying } from "../retry";
import { RESULTS } from "./constants";
import type { Verdict } from "./types";

export async function verdictOf(
  who: Contributor,
  circuit: CircuitName,
  signal?: AbortSignal,
): Promise<Verdict | null> {
  let r;
  try {
    r = await retrying(
      () => contributorCall(who, "GET", CONTRIBUTOR_PATHS.result(circuit), { signal }),
      signal,
    );
  } catch (error) {
    if (refusedWith(error, "unknown-job")) return null;
    throw error;
  }
  return {
    seq: asSafeInt(r.seq, "result.seq", 1, 2 ** 32),
    outputSha256: normalizeHex(r.output_sha256, "result.output_sha256", 32),
    status: asOneOf(r.status, "result.status", RESULTS),
    reason: r.reason === undefined ? "" : asOneOf(r.reason, "result.reason", REJECT_REASONS),
  };
}
