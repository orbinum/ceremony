/** A circuit's pinned genesis in a setup, or null if the ceremony does not have the circuit. */
import type { CircuitName } from "../../config";
import type { Setup } from "./types";

export const genesisOf = (setup: Setup, circuit: CircuitName) =>
  setup.init.circuits.find((c) => c.name === circuit) ?? null;
