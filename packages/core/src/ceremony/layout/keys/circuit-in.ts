/**
 * The circuit a key is a given per-circuit layout path for, or null. The path is rendered with a
 * byte no key holds and split on it, giving the prefix and suffix around the circuit's name.
 */
import type { CircuitName } from "../../../config";
import { isCircuitName } from "../../../primitives/schema";

const HOLE = "\u0000";

export function circuitIn(key: string, path: (c: CircuitName) => string): CircuitName | null {
  const [prefix = "", suffix = ""] = path(HOLE).split(HOLE);
  if (!key.startsWith(prefix) || !key.endsWith(suffix)) return null;
  const name = key.slice(prefix.length, key.length - suffix.length);
  return isCircuitName(name) ? name : null;
}
