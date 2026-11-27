/**
 * Fixed vocabulary of identities and signatures. Schemes: EIP-712 typed data for EVM wallets; the
 * prefixed JCS text for SS58 accounts, signed with sr25519 (Substrate extensions) or ed25519 (a
 * Solana wallet's key, or a Ledger account of an extension). Signature sizes: ECDSA r‖s‖v (65, or
 * 64 in EIP-2098 compact form), sr25519 and ed25519. `LOCAL_BUILD` is the commit of an unversioned
 * local build and `LOCAL_VERIFIER` the verifier version of a contribution the cli verified
 * in-process: only simulated (`contribute-local`) records carry them. The EIP-712 types cover
 * every message the ceremony asks a wallet to sign.
 */
export const SCHEMES = ["eip712", "sr25519", "ed25519"] as const;

export const CONTRIBUTION_METHODS = ["browser", "cli"] as const;

export const SIGNATURE_BYTES: Record<(typeof SCHEMES)[number], readonly number[]> = {
  eip712: [65, 64],
  sr25519: [64],
  ed25519: [64],
};

export const LOCAL_BUILD = "local";

export const LOCAL_VERIFIER = "cli-local";

export const ORBINUM_SS58_PREFIX = 42;

export const EIP712_TYPES = {
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
