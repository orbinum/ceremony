/**
 * Circuit constants: the audited circuits repository an announcement names by default, and the
 * circuits the session and verifier bounds were measured for (circuits v0.17.1: 3 circuits, 52,226
 * constraints, the largest 34,200), with a margin. A ceremony past that margin must have the active
 * cap, the snarkjs bounds and the container re-measured first.
 */
export const CIRCUITS_REPO_URL = "https://github.com/orbinum/circuits";

export const MEASURED_CIRCUITS = { maxTotalConstraints: 60_000, maxConstraints: 40_000 } as const;
