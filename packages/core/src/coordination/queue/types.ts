/**
 * Types of the session queue: its state, events, effects, refusals and the context of one step.
 * `tick` is the Durable Object's alarm. Rules: `maxRejected` rejections across sessions ban an
 * identity; `attemptsPerCircuit` consumed uploads end a circuit within a session; `infraPerSession`
 * `infra` results (or verify timeouts) over a session's circuits release it; `maxInfraResults` over
 * all of an identity's sessions hold it until the operator lifts the hold, so however its sessions
 * end its uploads cannot keep pausing the ceremony. A circuit's `attempts` count consumed uploads
 * (`ambiguous` and `infra` give theirs back) while `uploads` never goes down: it is the id of the
 * latest upload, so a late result names it. Invited contributors take reserved places, ahead of
 * everyone not invited. A slot's `activeMs` excludes the current running stretch, and
 * `runningSince` is null while frozen (verifying or paused). The `finalized` effect is recorded by
 * the sealed beacon, the transcript's last record.
 */
import type { CircuitName } from "../../config";
import type { CeremonyState } from "../../ceremony";
import type { VerificationResult } from "../../verification";

export interface QueueRules {
  claimWindowMs: number;
  heartbeatMs: number;
  missedHeartbeats: number;
  activeCapMs: number;
  noShowsForCooldown: number;
  cooldownMs: number;
  verifyDeadlineMs: number;
  maxRejected: number;
  attemptsPerCircuit: number;
  infraPerSession: number;
  maxInfraResults: number;
}

interface QueueEntry {
  githubId: number;
  enqueuedAt: number;
  invited: boolean;
}

export interface IdentityStanding {
  noShows: number;
  cooldownUntil: number;
  rejected: number;
  banned: boolean;
  infraResults: number;
  held: boolean;
  accepted: CircuitName[];
}

type CircuitStatus = "todo" | "verifying" | "accepted" | "skipped";

export interface SlotCircuit {
  circuit: CircuitName;
  status: CircuitStatus;
  attempts: number;
  uploads: number;
  infra: number;
}

export interface Slot {
  seq: number;
  githubId: number;
  grantedAt: number;
  claimedAt: number | null;
  lastHeartbeat: number;
  activeMs: number;
  runningSince: number | null;
  circuits: SlotCircuit[];
  verifyDeadline: number | null;
}

export interface QueueState {
  phase: CeremonyState;
  pausedBy: "operator" | "verifier" | null;
  schedule: { openAt: number; closeAt: number };
  circuits: CircuitName[];
  queue: QueueEntry[];
  identities: Record<string, IdentityStanding>;
  slot: Slot | null;
  nextSeq: number;
}

export type QueueEvent =
  | { type: "tick" }
  | { type: "join"; githubId: number; invited?: boolean }
  | { type: "leave"; githubId: number }
  | { type: "claim"; githubId: number }
  | { type: "heartbeat"; githubId: number }
  | { type: "uploaded"; githubId: number; circuit: CircuitName }
  | {
      type: "verified";
      seq: number;
      circuit: CircuitName;
      attempt: number;
      outcome: VerificationResult["result"];
    }
  | { type: "finish"; githubId: number }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "close" }
  | { type: "unhold"; githubId: number }
  | { type: "finalize" };

export type ReleaseReason = "finished" | "no-show" | "timeout" | "banned" | "closed" | "infra";

export type QueueEffect =
  | { type: "grant"; githubId: number; seq: number }
  | { type: "release"; githubId: number; seq: number; reason: ReleaseReason }
  | { type: "dispatch"; githubId: number; seq: number; circuit: CircuitName; attempt: number }
  | { type: "accepted"; githubId: number; seq: number; circuit: CircuitName }
  | { type: "state"; from: CeremonyState; to: CeremonyState; reason: string }
  | { type: "finalized" };

export type QueueRefusal =
  | "malformed"
  | "not-open"
  | "banned"
  | "held"
  | "cooldown"
  | "already-queued"
  | "nothing-left"
  | "not-your-slot"
  | "not-claimed"
  | "already-claimed"
  | "out-of-order"
  | "busy"
  | "no-verification"
  | "invalid-transition"
  | "attestation-closed"
  | "finalized";

export type StepResult =
  | { ok: true; state: QueueState; effects: QueueEffect[] }
  | { ok: false; state: QueueState; refusal: QueueRefusal };

export interface StepContext {
  s: QueueState;
  effects: QueueEffect[];
  now: number;
  rules: QueueRules;
}
