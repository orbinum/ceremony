/**
 * Fixed vocabulary of `ceremony.json`: its schema id; the networks a ceremony can be for (testnet
 * keys can never pass as mainnet ones); and the admission modes, where `open` admits every account
 * that passes the GitHub thresholds, invited ones ahead of the rest, and `closed` admits only the
 * invited, for private rehearsals (never on mainnet).
 */
export const ANNOUNCEMENT_SCHEMA = "orbinum-ceremony/announcement/v1";

export const NETWORKS = ["local", "testnet", "mainnet"] as const;

export const ADMISSION_MODES = ["open", "closed"] as const;
