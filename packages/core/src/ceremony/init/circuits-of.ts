/** The ceremony's circuits, in session order (the order `init.json` pins). */
import type { CircuitName } from "../../config";
import type { InitRecord } from "./types";

export const circuitsOf = (init: InitRecord): CircuitName[] => init.circuits.map((c) => c.name);
