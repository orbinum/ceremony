/**
 * `genesis/init.json`: the frozen inputs, published before contributions open. SPEC §2.1–2.3, §6.1.
 */
import type { CircuitName } from "../../config";

/** Schema id of the document. */
export const INIT_SCHEMA = "orbinum-ceremony/init/v1";

/** One circuit's frozen inputs and genesis. */
export interface InitCircuit {
  name: CircuitName;
  circuit_id: number;
  ceremony_version: number;
  r1cs_sha256: string;
  constraints: number;
  public_signals: number;
  wires: number;
  domain_power: number;
  genesis_sha256: string;
  cs_hash: string;
}

/** The whole document. */
export interface InitRecord {
  schema: typeof INIT_SCHEMA;
  ceremony_id: string;
  created_at: string;
  ptau: { file: string; blake2b512: string; size: number };
  tooling: { snarkjs: string; circom: string; circomlib: string; circom_flags: readonly string[] };
  source: { ref: string; commit: string };
  circuits: InitCircuit[];
}
