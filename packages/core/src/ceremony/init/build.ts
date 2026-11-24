/** Building `init.json` from what `init` measured. SPEC §2.1–2.3. */
import { type CircuitName, PTAU, TOOLING } from "../../config";
import { domainPower, type MpcParams, type R1csHeader } from "../../formats";
import { INIT_SCHEMA, type InitCircuit, type InitRecord } from "./types";
import { validateInit } from "./validate";

/** One circuit's entry from its r1cs header and the hashes of its r1cs and genesis. */
export const initCircuitOf = (
  name: CircuitName,
  ids: { circuitId: number; ceremonyVersion: number },
  header: R1csHeader,
  hashes: { r1csSha256: string; genesisSha256: string; csHash: string },
): InitCircuit => ({
  name,
  circuit_id: ids.circuitId,
  ceremony_version: ids.ceremonyVersion,
  r1cs_sha256: hashes.r1csSha256,
  constraints: header.constraints,
  public_signals: header.publicOutputs + header.publicInputs,
  wires: header.wires,
  domain_power: domainPower(header),
  genesis_sha256: hashes.genesisSha256,
  cs_hash: hashes.csHash,
});

/** A genesis has no MPC entry: anything else was not produced by `groth16 setup`. */
export const checkGenesis = (params: MpcParams): string[] =>
  params.entries.length === 0 ? [] : [`genesis has ${params.entries.length} MPC entries`];

/** Session order: fewest constraints first, then by name (code points: no locale). */
export const sessionOrder = (circuits: readonly InitCircuit[]): InitCircuit[] =>
  circuits.toSorted(
    (a, b) => a.constraints - b.constraints || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );

/** A validated `init.json`, pinned to `PTAU` and the pinned snarkjs, its circuits in session order. */
export const buildInit = (input: {
  ceremonyId: string;
  createdAt: string;
  circom: string;
  circomlib: string;
  circomFlags: readonly string[];
  source: { ref: string; commit: string };
  circuits: InitCircuit[];
}): InitRecord =>
  validateInit({
    schema: INIT_SCHEMA,
    ceremony_id: input.ceremonyId,
    created_at: input.createdAt,
    ptau: { file: PTAU.file, blake2b512: PTAU.blake2b512, size: PTAU.sizeBytes },
    tooling: {
      snarkjs: TOOLING.snarkjs,
      circom: input.circom,
      circomlib: input.circomlib,
      circom_flags: input.circomFlags,
    },
    source: input.source,
    circuits: sessionOrder(input.circuits),
  } satisfies InitRecord);
