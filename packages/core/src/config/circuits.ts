/** Circuits in scope; `id` is the on-chain `CircuitId` of `pallet-zk-verifier`. SPEC §2.1. */
export const CIRCUITS = {
  transfer: { id: 1, constraints: 33_688, publicInputs: 8, devVersion: 2, ceremonyVersion: 3 },
  unshield: { id: 2, constraints: 16_904, publicInputs: 8, devVersion: 2, ceremonyVersion: 3 },
  shield: { id: 3, constraints: 736, publicInputs: 3, devVersion: 1, ceremonyVersion: 2 },
} as const;

/** One of the circuits in scope. */
export type CircuitName = keyof typeof CIRCUITS;

/** Session order: smallest first, so client problems surface fast (SPEC §4.1). */
export const CIRCUIT_ORDER: readonly CircuitName[] = ["shield", "unshield", "transfer"];

/** The audited circuits repository an announcement names by default. SPEC §2.1. */
export const CIRCUITS_REPO_URL = "https://github.com/orbinum/circuits";
