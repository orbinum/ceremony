/**
 * The parsed zkey MPC section: csHash, the BLAKE2b-512 identity of (r1cs, ptau) written at
 * `groth16 setup`, and one entry per contribution or beacon. An entry's `hash` is h_k, BLAKE2b-512
 * over (deltaAfter, g1_s, g1_sx, g2_spx, transcript) as snarkjs computes it; `deltaAfter` is δ·G1
 * after the entry, uncompressed big-endian hex, not covered by h_k on its own; the free-text
 * `name` lies outside h_k, so only the transcript pins it; `numIterationsExp` and `beaconHash` are
 * the beacon's parameters.
 */
export type MpcEntryKind = "contribution" | "beacon";

export interface MpcEntry {
  kind: MpcEntryKind;
  hash: string;
  deltaAfter: string;
  name?: string;
  numIterationsExp?: number;
  beaconHash?: string;
}

export interface MpcParams {
  csHash: string;
  entries: MpcEntry[];
}
