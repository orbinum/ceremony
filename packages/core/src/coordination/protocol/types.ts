/**
 * Types of the wire contracts: coordinator ↔ verifier jobs and reports, the operator's
 * finalization, request authentication headers and every error code a client may read. A job's
 * report is kept without its log: the log is published with an accepted contribution, and a
 * retried callback carries it again.
 */
import type { CircuitName } from "../../config";
import type { BeaconRecord, Chained, ContributionClaimed, FinalRecord } from "../../ceremony";
import type { CurrentHead, RejectReason, VerificationResult } from "../../verification";
import type { QueueRefusal } from "../queue";

export type ContributionClaim = ContributionClaimed;

export interface JobId {
  seq: number;
  circuit: CircuitName;
  attempt: number;
}

export interface JobSpec {
  job: JobId & { index: number };
  claim: ContributionClaim;
  size: number;
  head: CurrentHead;
  genesisSha256: string;
}

export interface Job extends JobId {
  githubId: number;
  index: number;
  key: string;
  size: number;
  claim: ContributionClaim;
  status: "pending" | "done" | "stale";
  outcome: VerificationResult["result"] | null;
  report: StoredReport | null;
}

export type StoredReport = DistributiveOmit<VerifierReport, "log">;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type VerifierReport = { job: JobId & { index: number } } & (
  | {
      result: "valid";
      contributionHash: string;
      zkeyName: string;
      deltaAfter: string;
      logSha256: string;
      log: string;
      verifierVersion: string;
      snarkjsVersion: string;
    }
  | { result: "rejected"; reason: RejectReason; detail?: string }
  | { result: "ambiguous"; detail: string }
  | { result: "infra"; detail: string }
);

export interface FinalizeRequest {
  beacon: Chained<BeaconRecord>;
  finals: FinalRecord[];
}

export interface RequestAuthHeaders {
  timestamp: string | null | undefined;
  signature: string | null | undefined;
  bodySha256: string | null | undefined;
}

export type CeremonyRefusal =
  | QueueRefusal
  | "not-configured"
  | "already-configured"
  | "malformed-setup"
  | "not-linked"
  | "not-invited"
  | "nonce-invalid"
  | "already-linked"
  | "wallet-taken"
  | "stale-head"
  | "too-large"
  | "unknown-job"
  | "attestation-mismatch"
  | "already-attested"
  | "not-finalizable"
  | "storage";

export type ApiErrorCode =
  | CeremonyRefusal
  | "malformed"
  | "wrong-identity"
  | "stale-signature"
  | "invalid-signature"
  | "immutable"
  | "unauthenticated"
  | "forbidden"
  | "turnstile"
  | "rate-limited"
  | "not-found"
  | "internal";
