/**
 * What a turn needs from the outside world and reports back to the page: the coordinator calls
 * (the `api` module in the browser, fakes in the tests), how a contribution is computed (the
 * worker, or a fake), how to wait (injected so the tests do not), and the one request and one
 * reply between the page and the contribution worker. The worker gets a copy of the head, so the
 * page keeps its own for the checks; `name` is printable ASCII, written into the new MPC entry.
 */
import type { CircuitName, ClientInfo } from "@orbinum-ceremony/core";
import type { Head, JobResult, Slot, UploadClaim } from "../api";

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

export interface Computed {
  output: Uint8Array;
  contributionHash: string;
}

export type Compute = (input: Uint8Array, name: string, text: string) => Promise<Computed>;

export type Sleep = (ms: number) => Promise<void>;

export interface RunDeps {
  api: SessionApi;
  compute: Compute;
  csHashes: Map<CircuitName, string>;
  client: ClientInfo;
  text: string;
  lost: () => Error | null;
  sleep: Sleep;
}

export interface Accepted {
  circuit: CircuitName;
  index: number;
  inputSha256: string;
  outputSha256: string;
  contributionHash: string;
}

export type Stage =
  | "downloading"
  | "computing"
  | "checking"
  | "uploading"
  | "verifying"
  | "accepted"
  | "rejected"
  | "retrying";

export type Progress =
  | { circuit: CircuitName; stage: Stage; detail?: string }
  | { circuit: null; stage: "paused" };

export type Verdict = JobResult["status"];

export interface WorkerRequest {
  input: Uint8Array;
  name: string;
  text: string;
}

export type WorkerReply =
  | { ok: true; output: Uint8Array; contributionHash: string }
  | { ok: false; message: string };
