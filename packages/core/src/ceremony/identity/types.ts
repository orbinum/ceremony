/**
 * Who contributes and what their wallet signs, shared by the transcript and the coordinator. An
 * `Identity` is a contributor as the transcript records them: with the record's `ceremony_id` it
 * is the exact link payload their `link_sig` signs, so anyone can verify it. The link payload is
 * signed once on joining, before any compute is spent, to prove control of the wallet (EVM address
 * lowercase or EIP-55, or SS58; a coordinator-issued single-use 32-byte nonce; `issued_at` in Unix
 * seconds). The attestation payload is signed at the end of a session and covers every circuit of
 * it by hashes only, in session order, each circuit at most once. A client commit is 7–40
 * lowercase hex. A `LinkedIdentity` is a wallet bound to a GitHub identity by its link signature,
 * with the account's canonical key (lowercase EVM address, SS58 public key).
 */
import type { CircuitName } from "../../config";
import type { CONTRIBUTION_METHODS, EIP712_TYPES, SCHEMES } from "./constants";

export type Scheme = (typeof SCHEMES)[number];

export type ContributionMethod = (typeof CONTRIBUTION_METHODS)[number];

export interface ClientInfo {
  name: string;
  version: string;
  commit: string;
}

export interface Identity {
  github_id: number;
  github_login: string;
  account: string;
  scheme: Scheme;
  nonce: string;
  issued_at: number;
}

export interface LinkPayload {
  ceremony_id: string;
  github_id: number;
  github_login: string;
  account: string;
  nonce: string;
  issued_at: number;
}

export interface AttestedContribution {
  circuit: CircuitName;
  index: number;
  input_sha256: string;
  output_sha256: string;
  contribution_hash: string;
}

export interface AttestationPayload {
  ceremony_id: string;
  github_id: number;
  account: string;
  seq: number;
  contributions: AttestedContribution[];
  client: ClientInfo;
}

export interface LinkedIdentity {
  githubId: number;
  login: string;
  scheme: Scheme;
  account: string;
  accountKey: string;
  signature: string;
  nonce: string;
  issuedAt: number;
  linkedAt: number;
}

export interface Eip712Domain {
  name: "Orbinum Trusted Setup";
  version: "1";
  salt: string;
}

export interface TypedData<P extends "Link" | "Attestation"> {
  domain: Eip712Domain;
  types: Pick<
    typeof EIP712_TYPES,
    "EIP712Domain" | P | (P extends "Attestation" ? "Contribution" : never)
  >;
  primaryType: P;
  message: Record<string, unknown>;
}
