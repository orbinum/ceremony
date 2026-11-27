/**
 * What an attestation works with: the coordinator calls it makes, and what the page showed before
 * signing (the contributions this run accepted, and the circuits accepted earlier in the session,
 * before a reload, which it knows only by name).
 */
import type {
  AttestationPayload,
  AttestedContribution,
  CircuitName,
  Receipt,
} from "@orbinum-ceremony/core";

export interface AttestApi {
  getReceipt(seq: number): Promise<Receipt>;
  attest(payload: AttestationPayload, signature: string): Promise<unknown>;
}

export interface Shown {
  accepted: readonly AttestedContribution[];
  earlier: readonly CircuitName[];
}
