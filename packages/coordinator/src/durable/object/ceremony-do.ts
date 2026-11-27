/**
 * The ceremony's single writer, one per `CEREMONY_ID`: the only writer of the queue, the slot and
 * the transcript, and its RPC surface. The rules are core's; each method only delegates to
 * `durable/operations`, which commit through `durable/store` (state and transcript in SQLite, the
 * one alarm at the next deadline or a publication to retry, publication) over `durable/db`. Link
 * and attestation signatures are verified by the Worker before they reach it.
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

export class CeremonyDO extends DurableObject<Env> {
  private readonly store: Store;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = storeOf(ctx.storage, env);
  }

  async configure(input: SetupInput) {
    return op.configure(this.store, input);
  }

  async apply(event: QueueEvent) {
    return op.apply(this.store, event);
  }

  async finalize(request: FinalizeRequest) {
    return op.finalize(this.store, request);
  }

  async holdFinalWrite() {
    return op.holdFinalWrite(this.store);
  }

  async releaseFinalWrite(hold: string) {
    op.releaseFinalWrite(this.store, hold);
  }

  async snapshot() {
    return op.snapshot(this.store);
  }

  async setup() {
    return op.setupOf(this.store);
  }

  async finals() {
    return op.finals(this.store);
  }

  async transcript() {
    return op.transcript(this.store);
  }

  async receipt(seq: number) {
    return op.receipt(this.store, seq);
  }

  async head(circuit: CircuitName) {
    return op.head(this.store, circuit);
  }

  async spendOAuthState(state: string) {
    return op.spendOAuthState(this.store, state);
  }

  async spendRequestMac(signature: string, timestamp: number) {
    return op.spendRequestMac(this.store, signature, timestamp);
  }

  async issueNonce(githubId: number) {
    return op.issueNonce(this.store, githubId);
  }

  async link(id: Omit<LinkedIdentity, "linkedAt">) {
    return op.link(this.store, id);
  }

  async linked(githubId: number) {
    return op.linked(this.store, githubId);
  }

  async changeRefusal(githubId: number) {
    return op.changeRefusal(this.store, githubId);
  }

  async prepareUpload(upload: UploadRequest) {
    return op.prepareUpload(this.store, upload);
  }

  async releaseUpload(key: string) {
    op.releaseUpload(this.store, key);
  }

  async uploaded(upload: UploadRequest, key: string) {
    return op.uploaded(this.store, upload, key);
  }

  async pendingJob(id: JobId) {
    return op.pendingJob(this.store, id);
  }

  async latestJob(githubId: number, circuit: CircuitName) {
    return op.latestJob(this.store, githubId, circuit);
  }

  async report(r: VerifierReport) {
    return op.report(this.store, r);
  }

  async attest(githubId: number, payload: AttestationPayload, signature: string) {
    return op.attest(this.store, githubId, payload, signature);
  }

  override async alarm(): Promise<void> {
    await op.tick(this.store);
  }
}
