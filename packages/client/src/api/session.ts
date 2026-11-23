/**
 * One's session (SPEC §4.1–4.2, §3.5): claim and keep the turn, each circuit's head, upload and
 * verdict, the end of the session, its receipt and the attestation that closes it.
 */
import {
  type AttestationPayload,
  type CircuitName,
  CLAIM_HEADER,
  type ClientInfo,
  CONTRIBUTOR_PATHS,
  type headView,
  type jobResultView,
  type Receipt,
} from "@orbinum-ceremony/core";
import { call, putBytes } from "./http";

/** `GET /api/session/head/:circuit`: what the next contribution must extend. */
export type Head = ReturnType<typeof headView>;

/** `GET /api/session/result/:circuit`: the latest upload of the circuit and its verdict. */
export type JobResult = ReturnType<typeof jobResultView>;

/** What an upload declares in `CLAIM_HEADER` (SPEC §2.5): the hashes, how, and by which client. */
export interface UploadClaim {
  inputSha256: string;
  outputSha256: string;
  contributionHash: string;
  method: "browser";
  client: ClientInfo;
}

export const claimTurn = () => call<{ ok: true }>("POST", CONTRIBUTOR_PATHS.claim);

export const heartbeat = () => call<{ ok: true }>("POST", CONTRIBUTOR_PATHS.heartbeat);

/** Ends the session without an attestation (`busy` while a verification is in flight). */
export const finishSession = () => call<{ ok: true }>("POST", CONTRIBUTOR_PATHS.finish);

export const getHead = (circuit: CircuitName) => call<Head>("GET", CONTRIBUTOR_PATHS.head(circuit));

export const getResult = (circuit: CircuitName) =>
  call<JobResult>("GET", CONTRIBUTOR_PATHS.result(circuit));

/** Uploads one contribution; the coordinator answers 202 and verifies it in the background. */
export const uploadContribution = (circuit: CircuitName, output: Uint8Array, claim: UploadClaim) =>
  putBytes<{ ok: true }>(CONTRIBUTOR_PATHS.upload(circuit), output, {
    [CLAIM_HEADER]: JSON.stringify(claim),
  });

/** A session's records, each with its chain value. */
export const getReceipt = (seq: number) => call<Receipt>("GET", `/api/receipt/${seq}`);

/** Records the signed attestation; it also ends the session if it is still open. */
export const attest = (payload: AttestationPayload, signature: string) =>
  call<{ ok: true }>("POST", "/api/session/attest", { payload, signature });
