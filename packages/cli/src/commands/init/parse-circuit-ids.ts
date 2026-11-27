/** `--circuit-ids name=id,…`: well-formed names, ids in 1..2^32-1, no name or id twice. */
import { asCircuitName, type CircuitName, MAX_CIRCUITS } from "@orbinum-ceremony/core";
import { UsageError } from "../../args";
import type { InitCircuitOption } from "./types";

const CIRCUIT_ID = /^[1-9][0-9]{0,9}$/;

export function parseCircuitIds(text: string): InitCircuitOption[] {
  const entries = text.split(",");
  if (entries.length > MAX_CIRCUITS) {
    throw new UsageError(`--circuit-ids: at most ${MAX_CIRCUITS} circuits`);
  }
  const circuits = entries.map((entry) => {
    const [name = "", id = "", ...rest] = entry.trim().split("=");
    let circuitName: CircuitName;
    try {
      circuitName = asCircuitName(name, "--circuit-ids");
    } catch {
      throw new UsageError(`--circuit-ids: "${name}" is not a circuit name ([a-z][a-z0-9_]*)`);
    }
    if (rest.length > 0 || !CIRCUIT_ID.test(id) || Number(id) > 0xffff_ffff) {
      throw new UsageError(`--circuit-ids: "${entry.trim()}" is not <name>=<on-chain id>`);
    }
    return { name: circuitName, circuitId: Number(id) };
  });
  if (new Set(circuits.map((c) => c.name)).size !== circuits.length) {
    throw new UsageError("--circuit-ids: a circuit appears twice");
  }
  if (new Set(circuits.map((c) => c.circuitId)).size !== circuits.length) {
    throw new UsageError("--circuit-ids: two circuits share an id");
  }
  return circuits;
}
