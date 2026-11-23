/**
 * The attestation (SPEC §3.5): the linked wallet signs the session's accepted contributions, by
 * hashes only, as the transcript recorded them; the coordinator records it and ends the session.
 * Without it the contributions still count, as unattested.
 */
import {
  type AttestationPayload,
  type AttestedContribution,
  buildAttestationPayload,
  type CircuitName,
  type ClientInfo,
  type Receipt,
} from "@orbinum-ceremony/core";
import type { Me } from "../api";
import type { Wallet } from "../wallets";

/** The coordinator calls an attestation makes. */
export interface AttestApi {
  getReceipt(seq: number): Promise<Receipt>;
  attest(payload: AttestationPayload, signature: string): Promise<unknown>;
}

/**
 * What the page showed before signing: the contributions this run accepted, and the circuits
 * accepted earlier in the session (before a reload), which it knows only by name.
 */
export interface Shown {
  accepted: readonly AttestedContribution[];
  earlier: readonly CircuitName[];
}

/** The receipt (public and edge-cached) lags what this run saw accepted; signing again later works. */
export class StaleReceipt extends Error {
  override readonly name = "StaleReceipt";

  constructor() {
    super(
      "The published receipt does not match your accepted contributions yet. Wait a few seconds and sign again.",
    );
  }
}

const same = (a: AttestedContribution, b: AttestedContribution) =>
  a.circuit === b.circuit &&
  a.index === b.index &&
  a.input_sha256 === b.input_sha256 &&
  a.output_sha256 === b.output_sha256 &&
  a.contribution_hash === b.contribution_hash;

/**
 * Signs session `seq`'s accepted contributions with `wallet` and records the attestation. The
 * payload comes from the receipt, so it is signed only if it is exactly what the page `shown`.
 */
export async function attestSession(
  api: AttestApi,
  me: Me,
  wallet: Wallet,
  seq: number,
  client: ClientInfo,
  shown: Shown,
): Promise<AttestationPayload> {
  const receipt = await api.getReceipt(seq);
  const payload = buildAttestationPayload({
    ceremonyId: me.ceremonyId,
    githubId: me.githubId,
    account: me.linked?.account ?? wallet.account,
    seq,
    records: receipt.records,
    client,
  });
  const signed = payload.contributions;
  const missing = shown.accepted.some((a) => !signed.some((c) => same(a, c)));
  const extra = signed.some(
    (c) => !shown.earlier.includes(c.circuit) && !shown.accepted.some((a) => same(a, c)),
  );
  if (missing || extra) throw new StaleReceipt();
  if (signed.length === 0) throw new Error("this session has nothing to attest");
  await api.attest(payload, await wallet.signAttestation(payload));
  return payload;
}
