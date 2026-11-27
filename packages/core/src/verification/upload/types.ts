/**
 * The shapes upload acceptance shares. A verdict is `rejected` for a definitive fault (the turn is
 * consumed), `ambiguous` when the verifier cannot decide (re-upload allowed, turn not consumed;
 * reserved, the current verifier never returns it) or `infra` for a verifier error or timeout (the
 * ceremony pauses, nobody is penalized). Of the genesis' Groth16 header only `[deltaFrom, deltaTo)`
 * (δ in G1 and G2) may differ. A claim's `contributionHash` is h_k as the client reports it: never
 * trusted, only compared.
 */
import type { REJECT_REASONS } from "./constants";

interface RecordedEntry {
  hash: string;
  name: string;
  deltaAfter: string;
}

export interface HeadExpectation {
  csHash: string;
  previous: readonly RecordedEntry[];
}

export interface CurrentHead extends HeadExpectation {
  outputSha256: string;
}

export type RejectReason = (typeof REJECT_REASONS)[number];

export type VerificationResult =
  | { result: "valid"; index: number; contributionHash: string }
  | { result: "rejected"; reason: RejectReason; detail?: string }
  | { result: "ambiguous"; detail: string }
  | { result: "infra"; detail: string };

export interface UploadClaim {
  inputSha256: string;
  outputSha256: string;
  contributionHash: string;
}

export interface GenesisLayout {
  header: Uint8Array;
  groth16: Uint8Array;
  deltaFrom: number;
  deltaTo: number;
  sizes: ReadonlyMap<number, number>;
}
