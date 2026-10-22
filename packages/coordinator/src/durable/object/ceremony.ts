/**
 * The ceremony's single writer (SPEC §4.3): its RPC surface. The rules are core's; each method
 * delegates to `durable/operations`, which commit through `durable/store` (state and transcript
 * in SQLite, the one alarm at `nextDeadline`, publication) over `durable/db`.
 */
import { DurableObject } from "cloudflare:workers";
import type {
  AttestationPayload,
  CircuitName,
  FinalizeRequest,
  JobId,
  LinkedIdentity,
  QueueEvent,
  SetupInput,
  UploadRequest,
  VerifierReport,
} from "@orbinum-ceremony/core";
import * as op from "../operations";
import { type Store, storeOf } from "../store";

/** One per `CEREMONY_ID`: the only writer of the queue, the slot and the transcript. */
export class CeremonyDO extends DurableObject<Env> {
  private readonly store: Store;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = storeOf(ctx.storage, env);
  }

  /** Freezes the setup once; the same setup again is a no-op, any other is refused. */
  async configure(input: SetupInput) {
    return op.configure(this.store, input);
  }

  /** Queue events from contributors and operators (uploads and results have their own methods). */
  async apply(event: QueueEvent) {
    return op.apply(this.store, event);
  }

  /** Seals the ceremony with the operator's beacon and finals (SPEC §2.6). */
  async finalize(request: FinalizeRequest) {
    return op.finalize(this.store, request);
  }

  /** The queue state (null before `configure`). */
  async snapshot() {
    return op.snapshot(this.store);
  }

  /** The setup the ceremony runs (null before `configure`). */
  async setup() {
    return op.setupOf(this.store);
  }

  /** The final records sealed at the handover (none before it). */
  async finals() {
    return op.finals(this.store);
  }

  /** The transcript so far and the chain it starts from. */
  async transcript() {
    return op.transcript(this.store);
  }

  /** A session's receipt: its records, each with its chain value, and the anchor. */
  async receipt(seq: number) {
    return op.receipt(this.store, seq);
  }

  /** The head of a circuit: what the next contribution must extend (SPEC §2.5). */
  async head(circuit: CircuitName) {
    return op.head(this.store, circuit);
  }

  /** A fresh single-use nonce for this identity's link signature. */
  async issueNonce(githubId: number) {
    return op.issueNonce(this.store, githubId);
  }

  /** Binds a wallet (signature verified by the Worker): 1 GitHub = 1 wallet. */
  async link(id: Omit<LinkedIdentity, "linkedAt">) {
    return op.link(this.store, id);
  }

  /** The wallet linked to this identity, if any. */
  async linked(githubId: number) {
    return op.linked(this.store, githubId);
  }

  /** Checks an upload before its bytes move; returns the private key to stream it to. */
  async prepareUpload(upload: UploadRequest) {
    return op.prepareUpload(this.store, upload);
  }

  /** The bytes are under `key`: the job waits for the verifier. */
  async uploaded(upload: UploadRequest, key: string) {
    return op.uploaded(this.store, upload, key);
  }

  /** A job still waiting for its result; the verifier may read only these objects. */
  async pendingJob(id: JobId) {
    return op.pendingJob(this.store, id);
  }

  /** The caller's latest upload of a circuit and what became of it. */
  async latestJob(githubId: number, circuit: CircuitName) {
    return op.latestJob(this.store, githubId, circuit);
  }

  /** The verifier's result for a job, idempotently. */
  async report(r: VerifierReport) {
    return op.report(this.store, r);
  }

  /** The session's attestation (signature verified by the Worker). */
  async attest(githubId: number, payload: AttestationPayload, signature: string) {
    return op.attest(this.store, githubId, payload, signature);
  }

  /** The single alarm: the next deadline of the queue, or a publication to retry. */
  override async alarm(): Promise<void> {
    await op.tick(this.store);
  }
}
