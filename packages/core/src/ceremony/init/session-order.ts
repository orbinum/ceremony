/** Session order: fewest constraints first, then by name (code points, no locale). */
import type { InitCircuit } from "./types";

export const sessionOrder = (circuits: readonly InitCircuit[]): InitCircuit[] =>
  circuits.toSorted(
    (a, b) => a.constraints - b.constraints || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
