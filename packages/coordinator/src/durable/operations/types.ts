/**
 * Types the operations share: what a state-changing call returns (its effects, or the refusal with
 * any problems behind it), a valid verifier report, and how a report was applied.
 */
import type { CeremonyRefusal, QueueEffect, VerifierReport } from "@orbinum-ceremony/core";

export type Outcome =
  | { ok: true; effects: QueueEffect[] }
  | { ok: false; refusal: CeremonyRefusal; problems?: string[] };

export type Valid = Extract<VerifierReport, { result: "valid" }>;

export type Applied =
  | { ok: true; status: "applied" | "stale" | "duplicate" }
  | { ok: false; refusal: CeremonyRefusal };
