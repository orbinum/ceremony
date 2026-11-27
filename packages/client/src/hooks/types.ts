/**
 * Where a turn is, as the page shows it: each circuit's stage with the last thing said about it,
 * the session's circuits in session order, and, while signing, the circuits accepted before this
 * run (a reload mid-turn), whose hashes are not known here.
 */
import type { CircuitName, Receipt } from "@orbinum-ceremony/core";
import type { Accepted, Stage } from "../contribution";

export type CircuitStages = Partial<Record<CircuitName, { stage: Stage; detail?: string }>>;

export type TurnState =
  | { kind: "idle" }
  | {
      kind: "running";
      seq: number;
      order: CircuitName[];
      circuits: CircuitStages;
      paused: boolean;
    }
  | {
      kind: "signing";
      seq: number;
      accepted: Accepted[];
      earlier: CircuitName[];
      busy: boolean;
      error?: unknown;
    }
  | { kind: "done"; seq: number; attested: boolean; receipt: Receipt | null }
  | { kind: "failed"; error: unknown };
