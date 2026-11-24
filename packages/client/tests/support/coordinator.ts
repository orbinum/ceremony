/**
 * A coordinator for one turn, in memory: every circuit's head is `multiplier_1`, each upload is
 * verified on the next poll with the verdict queued for its circuit (`valid` by default), and the
 * turn closes itself once nothing is left to do — as the queue does.
 */
import type { CeremonyState, CircuitName } from "@orbinum-ceremony/core";
import type { Head, JobResult, Slot, UploadClaim } from "../../src/api";
import type { SessionApi } from "../../src/contribution";
import { chain } from "./fixtures";

/** The fake ceremony's circuits, in session order. */
export const CIRCUIT_NAMES: CircuitName[] = ["shield", "unshield", "transfer"];

type CircuitStatus = "todo" | "verifying" | "accepted" | "skipped";
type Outcome = NonNullable<JobResult["status"]>;

export class FakeCoordinator implements SessionApi {
  readonly seq = 7;
  phase: CeremonyState = "OPEN";
  /** The head's bytes as served (an attack test serves others). */
  headBytes = () => chain().head;
  readonly status = new Map<CircuitName, CircuitStatus>(CIRCUIT_NAMES.map((c) => [c, "todo"]));
  /** Verdicts to give, per circuit, in order; `valid` once none is left. */
  readonly verdicts = new Map<CircuitName, Outcome[]>();
  /** Errors the next uploads throw, in order. */
  readonly uploadErrors: Error[] = [];
  readonly uploads: { circuit: CircuitName; claim: UploadClaim; bytes: Uint8Array }[] = [];
  readonly calls: string[] = [];
  private readonly jobs = new Map<CircuitName, JobResult>();

  async getSlot(): Promise<Slot> {
    const open = [...this.status.values()].some((s) => s === "todo" || s === "verifying");
    return {
      phase: this.phase,
      position: null,
      slot: open
        ? {
            seq: this.seq,
            claimed: true,
            claimBy: null,
            circuits: CIRCUIT_NAMES.map((circuit) => ({
              circuit,
              status: this.status.get(circuit) ?? "todo",
              attempts: 0,
            })),
          }
        : null,
    };
  }

  async claimTurn() {
    this.calls.push("claim");
  }

  async heartbeat() {
    this.calls.push("heartbeat");
  }

  async finishSession() {
    this.calls.push("finish");
  }

  async getHead(circuit: CircuitName): Promise<Head> {
    const c = chain();
    return { index: c.headIndex, output_sha256: c.headSha256, url: `/artifacts/${circuit}` };
  }

  async download(): Promise<Uint8Array> {
    return this.headBytes();
  }

  async uploadContribution(circuit: CircuitName, output: Uint8Array, claim: UploadClaim) {
    const error = this.uploadErrors.shift();
    if (error) throw error;
    this.uploads.push({ circuit, claim, bytes: output.slice() });
    this.status.set(circuit, "verifying");
    this.jobs.set(circuit, {
      seq: this.seq,
      attempt: this.uploads.length,
      index: chain().headIndex + 1,
      output_sha256: claim.outputSha256,
      status: "pending",
    });
    return { ok: true };
  }

  async getResult(circuit: CircuitName): Promise<JobResult> {
    const job = this.jobs.get(circuit);
    if (!job) throw new Error(`no upload of ${circuit}`);
    if (job.status === "pending") {
      const verdict = this.verdicts.get(circuit)?.shift() ?? "valid";
      job.status = verdict;
      this.status.set(circuit, verdict === "valid" ? "accepted" : "todo");
    }
    return job;
  }
}
