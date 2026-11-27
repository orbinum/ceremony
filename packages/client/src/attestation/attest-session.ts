/**
 * The attestation: the linked wallet signs session `seq`'s accepted contributions, by hashes only,
 * as the transcript recorded them, and the coordinator records it and ends the session. Without it
 * the contributions still count, as unattested. The payload is built from the receipt, so it is
 * signed only if it is exactly what the page showed: nothing missing, nothing extra, and one
 * record per circuit, since a session contributes once to each; a circuit shown only by name
 * (accepted before a reload) must have exactly one record at a valid chain index.
 */
import {
  type AttestationPayload,
  type AttestedContribution,
  buildAttestationPayload,
  type ClientInfo,
} from "@orbinum-ceremony/core";
import type { Me } from "../api";
import type { Wallet } from "../wallets";
import { StaleReceipt } from "./stale-receipt";
import type { AttestApi, Shown } from "./types";

const same = (a: AttestedContribution, b: AttestedContribution) =>
  a.circuit === b.circuit &&
  a.index === b.index &&
  a.input_sha256 === b.input_sha256 &&
  a.output_sha256 === b.output_sha256 &&
  a.contribution_hash === b.contribution_hash;

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
  const onePerCircuit =
    new Set(signed.map((c) => c.circuit)).size === signed.length &&
    shown.earlier.every((name) => signed.some((c) => c.circuit === name)) &&
    signed.every((c) => Number.isSafeInteger(c.index) && c.index >= 1);
  if (missing || extra || !onePerCircuit) throw new StaleReceipt();
  if (signed.length === 0) throw new Error("this session has nothing to attest");
  await api.attest(payload, await wallet.signAttestation(payload));
  return payload;
}
