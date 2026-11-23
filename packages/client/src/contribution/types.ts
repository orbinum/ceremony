/** What a session needs from the outside world, and what it reports back to the page. */
import type { CircuitName, ClientInfo } from "@orbinum-ceremony/core";
import type { Head, JobResult, Slot, UploadClaim } from "../api";
import type { Compute } from "./compute";
import type { Sleep } from "./retry";

/** The coordinator calls a session makes (the `api` module in the browser, fakes in the tests). */
export interface SessionApi {
  getSlot(): Promise<Slot>;
  claimTurn(): Promise<unknown>;
  heartbeat(): Promise<unknown>;
  finishSession(): Promise<unknown>;
  getHead(circuit: CircuitName): Promise<Head>;
  download(url: string): Promise<Uint8Array>;
  uploadContribution(
    circuit: CircuitName,
    output: Uint8Array,
    claim: UploadClaim,
  ): Promise<unknown>;
  getResult(circuit: CircuitName): Promise<JobResult>;
}

/** Everything `contributeAll` uses. */
export interface RunDeps {
  api: SessionApi;
  compute: Compute;
  /** Each circuit's csHash, from the published `init.json`. */
  csHashes: Map<CircuitName, string>;
  client: ClientInfo;
  /** The contributor's own text, mixed into each circuit's randomness. */
  text: string;
  /** Why the session is lost (the heartbeats stopped holding it), or null while it holds. */
  lost: () => Error | null;
  sleep: Sleep;
}

/** One accepted contribution, as the records and the attestation name it. */
export interface Accepted {
  circuit: CircuitName;
  index: number;
  inputSha256: string;
  outputSha256: string;
  contributionHash: string;
}

/** Where one circuit is. */
export type Stage =
  | "downloading"
  | "computing"
  | "checking"
  | "uploading"
  | "verifying"
  | "accepted"
  | "rejected"
  | "retrying";

/** A step of the session, for the page. */
export type Progress =
  | { circuit: CircuitName; stage: Stage; detail?: string }
  | { circuit: null; stage: "paused" };

/** Where a verdict leaves an upload. */
export type Verdict = JobResult["status"];
