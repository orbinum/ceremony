/** One circuit's `init.json` entry; throws if the ceremony does not have it. */
import type { CircuitName } from "../../config";
import type { InitCircuit, InitRecord } from "./types";

export function circuitOf(init: InitRecord, name: CircuitName): InitCircuit {
  const c = init.circuits.find((x) => x.name === name);
  if (!c) throw new Error(`${name} is not in init.json`);
  return c;
}
