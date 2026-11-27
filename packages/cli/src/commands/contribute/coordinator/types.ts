/**
 * The coordinator's answers as `contribute` uses them, validated values only (they become paths and
 * terminal text): one's place in line or session, the latest upload of a circuit and its verdict,
 * and a circuit's head (its index, key and download).
 */
import type { CEREMONY_STATES, CircuitName } from "@orbinum-ceremony/core";
import type { RESULTS, SLOT_STATUSES } from "./constants";

export interface SlotView {
  phase: (typeof CEREMONY_STATES)[number];
  position: number | null;
  slot: {
    seq: number;
    claimed: boolean;
    circuits: { circuit: CircuitName; status: (typeof SLOT_STATUSES)[number] }[];
  } | null;
}

export interface Verdict {
  seq: number;
  outputSha256: string;
  status: (typeof RESULTS)[number];
  reason: string;
}

export interface Head {
  index: number;
  outputSha256: string;
  url: string;
}
