/** Whether a key is a final file: what the operator may publish once the ceremony is sealed. */
import { finalCircuitOf } from "./final-circuit-of";

export const isFinalFileKey = (key: string): boolean => finalCircuitOf(key) !== null;
