/**
 * EIP-712 typed data for EVM wallets. `chainId` is deliberately absent: the ceremony is off-chain,
 * and the `salt` binds the domain to one ceremony instance. SPEC §3.6, A4.
 */
import { hex0x, toHex, utf8 } from "../../primitives/encoding";
import { keccak256 } from "../../primitives/hashing";
import type { AttestationPayload, LinkPayload } from "./types";

/** The EIP-712 types of every message the ceremony asks a wallet to sign. */
const EIP712_TYPES = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "salt", type: "bytes32" },
  ],
  Link: [
    { name: "ceremonyId", type: "string" },
    { name: "githubId", type: "uint64" },
    { name: "githubLogin", type: "string" },
    { name: "account", type: "address" },
    { name: "nonce", type: "bytes32" },
    { name: "issuedAt", type: "uint64" },
  ],
  Contribution: [
    { name: "circuit", type: "string" },
    { name: "index", type: "uint32" },
    { name: "inputSha256", type: "bytes32" },
    { name: "outputSha256", type: "bytes32" },
    { name: "contributionHash", type: "bytes" },
  ],
  Attestation: [
    { name: "ceremonyId", type: "string" },
    { name: "githubId", type: "uint64" },
    { name: "account", type: "address" },
    { name: "seq", type: "uint32" },
    { name: "contributions", type: "Contribution[]" },
    { name: "clientName", type: "string" },
    { name: "clientVersion", type: "string" },
    { name: "clientCommit", type: "string" },
  ],
} as const;

/** The domain every ceremony message is signed under. */
interface Eip712Domain {
  name: "Orbinum Trusted Setup";
  version: "1";
  salt: string;
}

/** What a wallet's `eth_signTypedData_v4` receives, and what the verifier recovers from. */
export interface TypedData<P extends "Link" | "Attestation"> {
  domain: Eip712Domain;
  types: Pick<
    typeof EIP712_TYPES,
    "EIP712Domain" | P | (P extends "Attestation" ? "Contribution" : never)
  >;
  primaryType: P;
  message: Record<string, unknown>;
}

/**
 * `salt = keccak256(utf8(ceremony_id))`: a signature for one ceremony never verifies for another.
 */
export function eip712Domain(ceremonyId: string): Eip712Domain {
  return {
    name: "Orbinum Trusted Setup",
    version: "1",
    salt: hex0x(toHex(keccak256(utf8(ceremonyId)))),
  };
}

/** The link payload as EIP-712 typed data. */
export function linkTypedData(p: LinkPayload): TypedData<"Link"> {
  const { EIP712Domain, Link } = EIP712_TYPES;
  return {
    domain: eip712Domain(p.ceremony_id),
    types: { EIP712Domain, Link },
    primaryType: "Link",
    message: {
      ceremonyId: p.ceremony_id,
      githubId: p.github_id,
      githubLogin: p.github_login,
      account: p.account,
      nonce: hex0x(p.nonce),
      issuedAt: p.issued_at,
    },
  };
}

/** The attestation payload as EIP-712 typed data. */
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
