/**
 * Who may contribute and how many contributions a ceremony needs.
 * - `MAINNET_MIN_CONTRIBUTIONS`: per circuit, on mainnet.
 * - `SIMULATED_NETWORKS`: networks whose transcript may hold simulated contributions
 *   (`contribute-local`), i.e. rehearsals. A mainnet transcript with one is not a ceremony.
 * - `GITHUB_THRESHOLDS`: GitHub admission thresholds, an anti-sybil measure, not a cryptographic
 *   assumption.
 */
export const MAINNET_MIN_CONTRIBUTIONS = 50;

export const SIMULATED_NETWORKS: readonly string[] = ["local", "testnet"];

export const GITHUB_THRESHOLDS = {
  minAgeDays: 30,
  minPublicRepos: 1,
  minFollowing: 5,
} as const;
