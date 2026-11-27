/**
 * An attestation payload as the EIP-712 typed data an EVM wallet signs and the verifier recovers
 * from.
 */
import { hex0x } from "../../../primitives/encoding";
import { EIP712_TYPES } from "../constants";
import { eip712Domain } from "./eip712-domain";
import type { AttestationPayload, TypedData } from "../types";

export function attestationTypedData(p: AttestationPayload): TypedData<"Attestation"> {
  const { EIP712Domain, Contribution, Attestation } = EIP712_TYPES;
  return {
    domain: eip712Domain(p.ceremony_id),
    types: { EIP712Domain, Contribution, Attestation },
    primaryType: "Attestation",
    message: {
      ceremonyId: p.ceremony_id,
      githubId: p.github_id,
      account: p.account,
      seq: p.seq,
      contributions: p.contributions.map((c) => ({
        circuit: c.circuit,
        index: c.index,
        inputSha256: hex0x(c.input_sha256),
        outputSha256: hex0x(c.output_sha256),
        contributionHash: hex0x(c.contribution_hash),
      })),
      clientName: p.client.name,
      clientVersion: p.client.version,
      clientCommit: p.client.commit,
    },
  };
}
