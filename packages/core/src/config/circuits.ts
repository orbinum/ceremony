/**
 * A circuit is named by the ceremony, not by this code: `init` takes the circuits and their
 * on-chain ids from the operator and everything else from the announced circuits release, and
 * `genesis/init.json` pins them, in session order. SPEC §2.1.
 */
export type CircuitName = string;

/** The audited circuits repository an announcement names by default. SPEC §2.1. */
export const CIRCUITS_REPO_URL = "https://github.com/orbinum/circuits";
