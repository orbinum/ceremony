/** The version a ceremony key becomes: the one after the release's active version. */
import type { PublishedCircuit } from "./types";

export const ceremonyVersionOf = (circuit: PublishedCircuit): number => circuit.version + 1;
