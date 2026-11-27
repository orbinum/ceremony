/** The circuit of a final file (`final/<c>.final.zkey` or `final/<c>.vk.json`), or null. */
import type { CircuitName } from "../../../config";
import { circuitIn } from "./circuit-in";
import { CEREMONY_LAYOUT } from "../constants";

export const finalCircuitOf = (key: string): CircuitName | null =>
  circuitIn(key, CEREMONY_LAYOUT.finalZkey) ?? circuitIn(key, CEREMONY_LAYOUT.finalVk);
