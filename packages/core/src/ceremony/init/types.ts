/**
 * `genesis/init.json`: the frozen inputs, published before contributions open. `circuit_id` is the
 * on-chain `CircuitId` the operator names; `ceremony_version` is the release's active version + 1,
 * the version the final key becomes. Circuits are in session order, which every component follows:
 * `init` writes fewest constraints first, so client problems surface fast. A `PublishedCircuit` is
 * what the audited release published for one circuit.
 */
import type { CircuitName } from "../../config";
import type { INIT_SCHEMA } from "./constants";

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

export interface InitRecord {
  schema: typeof INIT_SCHEMA;
  ceremony_id: string;
  created_at: string;
  ptau: { file: string; blake2b512: string; size: number };
  tooling: { snarkjs: string; circom: string; circomlib: string; circom_flags: readonly string[] };
  source: { ref: string; commit: string };
  circuits: InitCircuit[];
}

export interface PublishedCircuit {
  version: number;
  r1csSha256: string;
}
