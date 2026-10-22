/**
 * The coordinator ↔ verifier wire contract, and the operator's finalization.
 * COORDINATOR §3, §5, SPEC §2.5–2.6.
 */
import type { CircuitName } from "../../config";
import type { BeaconRecord, Chained, ContributionClaimed, FinalRecord } from "../../ceremony";
import type { CurrentHead, RejectReason, VerificationResult } from "../../verification";

/** What the contributor declares with an upload; the verifier checks every hash. */
export type ContributionClaim = ContributionClaimed;

/** One verification: upload `attempt` of one circuit in one session. */
export interface JobId {
  seq: number;
  circuit: CircuitName;
  attempt: number;
}

/** Coordinator → verifier (`POST /verify`): everything SPEC §2.5 needs besides the bytes. */
export interface JobSpec {
  /** `index`: the contribution index the upload must take (head index + 1). */
  job: JobId & { index: number };
  claim: ContributionClaim;
  /** Exact byte length of the upload. */
  size: number;
  head: CurrentHead;
  genesisSha256: string;
}

/**
 * One upload under `PRIVATE/<key>` and what became of it. The report is kept without its log:
 * the log is published with an accepted contribution, and a retried callback carries it again.
 */
export interface Job extends JobId {
  githubId: number;
  /** The contribution index this upload would take (1-based). `attempt`: the upload id. */
  index: number;
  key: string;
  size: number;
  claim: ContributionClaim;
  /** `stale`: the turn moved on (timeout, pause, release) before a result arrived. */
  status: "pending" | "done" | "stale";
  outcome: VerificationResult["result"] | null;
  report: StoredReport | null;
}

/** A report as a job keeps it. */
export type StoredReport = DistributiveOmit<VerifierReport, "log">;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Verifier → coordinator (`POST /internal/verifications`): the SPEC §2.5 result contract. */
export type VerifierReport = { job: JobId & { index: number } } & (
  | {
      result: "valid";
      contributionHash: string;
      zkeyName: string;
      deltaAfter: string;
      logSha256: string;
      /** The `zkey verify` log itself, published next to the contribution. */
      log: string;
      verifierVersion: string;
      snarkjsVersion: string;
    }
  | { result: "rejected"; reason: RejectReason; detail?: string }
  | { result: "ambiguous"; detail: string }
  | { result: "infra"; detail: string }
);

/**
 * Operator → coordinator (`POST /admin/finalize`): the beacon `finalize` sealed, chained after the
 * transcript it downloaded, and one final record per circuit, bound to that beacon.
 */
export interface FinalizeRequest {
  beacon: Chained<BeaconRecord>;
  finals: FinalRecord[];
}
