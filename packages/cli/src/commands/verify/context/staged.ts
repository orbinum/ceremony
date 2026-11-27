/** A staged file path, or a throw, so a check on an input that failed to stage fails instead of passing. */
import type { CircuitName } from "@orbinum-ceremony/core";

export const staged = (map: Map<CircuitName, string>, c: CircuitName, what: string): string => {
  const path = map.get(c);
  if (!path) throw new Error(`${c} ${what} could not be staged`);
  return path;
};
