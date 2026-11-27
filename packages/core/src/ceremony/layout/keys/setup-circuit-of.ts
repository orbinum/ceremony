/** The circuit of a per-circuit setup file (`r1cs/<c>.r1cs`, `genesis/<c>.genesis.zkey`), or null. */
import type { CircuitName } from "../../../config";
import { circuitIn } from "./circuit-in";
import { CEREMONY_LAYOUT } from "../constants";

export const setupCircuitOf = (key: string): CircuitName | null =>
  circuitIn(key, CEREMONY_LAYOUT.r1cs) ?? circuitIn(key, (c) => CEREMONY_LAYOUT.zkey(c, 0));
