/** One circuit's `init.json` entry, from its r1cs header and the hashes of its r1cs and genesis. */
import type { CircuitName } from "../../../config";
import { domainPower, type R1csHeader } from "../../../formats";
import type { InitCircuit } from "../types";

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
