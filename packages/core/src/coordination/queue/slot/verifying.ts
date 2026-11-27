/** The circuit of a session in verification, if any. */
import type { Slot, SlotCircuit } from "../types";

export const verifying = (slot: Slot): SlotCircuit | undefined =>
  slot.circuits.find((c) => c.status === "verifying");
