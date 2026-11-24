/** Who contributes and what their wallet signs: shared by the transcript and the coordinator. */
import type { CircuitName } from "../../config";

/**
 * Wallet signature schemes (SPEC §3.6–3.7): EIP-712 typed data for EVM wallets; the prefixed JCS
 * text for SS58 accounts, signed with sr25519 (Substrate extensions) or ed25519 (a Solana wallet's
 * key, or a Ledger account of an extension).
 */
export const SCHEMES = ["eip712", "sr25519", "ed25519"] as const;

/** A wallet signature scheme. */
export type Scheme = (typeof SCHEMES)[number];

/** How a contribution was computed. */
export const CONTRIBUTION_METHODS = ["browser", "cli"] as const;

/** One contribution method. */
export type ContributionMethod = (typeof CONTRIBUTION_METHODS)[number];

/** The client build that produced a contribution or signed an attestation. */
export interface ClientInfo {
  name: string;
  version: string;
  /** Build commit, 7–40 lowercase hex. */
  commit: string;
}

/**
 * A contributor as the transcript records them: with the record's `ceremony_id`, the exact link
 * payload their `link_sig` signs, so anyone can verify it. SPEC §3.4, §6.3.
 */
export interface Identity {
  github_id: number;
  github_login: string;
  account: string;
  scheme: Scheme;
  /** The link payload's nonce and `issued_at`. */
  nonce: string;
  issued_at: number;
}

/** Signed once on joining, before any compute is spent: proves control of the wallet. SPEC §3.4. */
export interface LinkPayload {
  ceremony_id: string;
  github_id: number;
  github_login: string;
  /** EVM address (`0x…`, lowercase or EIP-55) or SS58 address. */
  account: string;
  /** Coordinator-issued, single-use, 32 bytes lowercase hex. */
  nonce: string;
  /** Unix seconds. */
  issued_at: number;
}

/** One circuit of a session, by hashes only. SPEC §3.5. */
export interface AttestedContribution {
  circuit: CircuitName;
  index: number;
  input_sha256: string;
  output_sha256: string;
  /** h_k, BLAKE2b-512 as snarkjs prints it. */
  contribution_hash: string;
}

/** Signed at the end of a session; one signature covers every circuit of it. SPEC §3.5. */
export interface AttestationPayload {
  ceremony_id: string;
  github_id: number;
  account: string;
  seq: number;
  /** In session order (the order `init.json` pins), each circuit at most once. */
  contributions: AttestedContribution[];
  client: ClientInfo;
}
