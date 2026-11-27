/**
 * The independent verifier's verdict on one final key: the failed checks with their detail, and
 * the csHash (absent when it could not read one) and per-entry h_k as that implementation computed
 * them, for comparison with the transcript.
 */
export interface IndependentVerdict {
  ok: boolean;
  failures: string[];
  csHash?: string;
  entries: { kind: "contribution" | "beacon"; hash: string }[];
}
