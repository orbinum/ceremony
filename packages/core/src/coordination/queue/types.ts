/** Types of the session queue: its state, events, effects and refusals. SPEC §4.1–4.3. */
import type { CircuitName } from "../../config";
import type { CeremonyState } from "../../ceremony";
import type { VerificationResult } from "../../verification";

/** Timers and limits of SPEC §4.2, in milliseconds. */
export interface QueueRules {
  claimWindowMs: number;
  heartbeatMs: number;
  missedHeartbeats: number;
  activeCapMs: number;
  noShowsForCooldown: number;
  cooldownMs: number;
  verifyDeadlineMs: number;
  /** `rejected` results across sessions before an identity is banned. */
  maxRejected: number;
  /** Consumed uploads of one circuit within a session (`rejected` consumes, others refund). */
  attemptsPerCircuit: number;
  /** `infra` results (or verify timeouts), over all its circuits, before a session is released. */
  infraPerSession: number;
  /**
   * `infra` results of one identity, over all its sessions, before it is held for the operator's
   * review: however its sessions end (released, finished, left), its uploads cannot keep pausing
   * the ceremony.
   */
  maxInfraResults: number;
}

/** A place in the queue. */
interface QueueEntry {
  githubId: number;
  enqueuedAt: number;
  /** Invited contributors use reserved positions: ahead of everyone not invited. */
  invited: boolean;
}

/** What the queue remembers about an identity across sessions. */
export interface IdentityStanding {
  noShows: number;
  cooldownUntil: number;
  rejected: number;
  banned: boolean;
  /** `infra` results (or verify timeouts) of its uploads, over all its sessions. */
  infraResults: number;
  /** Held after `maxInfraResults`: no slot until the operator lifts it (`unhold`). */
  held: boolean;
  /** Circuits accepted in earlier sessions: a later session offers only the others. */
  accepted: CircuitName[];
}

/** Where one circuit of a session stands. */
type CircuitStatus = "todo" | "verifying" | "accepted" | "skipped";

/** One circuit of a session. */
export interface SlotCircuit {
  circuit: CircuitName;
  status: CircuitStatus;
  /** Uploads that consumed an attempt (`ambiguous` and `infra` give theirs back). */
  attempts: number;
  /** Uploads made, never decremented: the id of the latest one, so a late result names it. */
  uploads: number;
  /** `infra` results (or verify timeouts) so far. */
  infra: number;
}

/** The single active session. */
export interface Slot {
  seq: number;
  githubId: number;
  grantedAt: number;
  claimedAt: number | null;
  lastHeartbeat: number;
  /** Active time already spent, not counting the current running stretch. */
  activeMs: number;
  /** Start of the current running stretch; null while frozen (verifying or paused). */
  runningSince: number | null;
  /** The circuits this session covers, in session order. */
  circuits: SlotCircuit[];
  verifyDeadline: number | null;
}

/** The whole queue. */
export interface QueueState {
  phase: CeremonyState;
  pausedBy: "operator" | "verifier" | null;
  schedule: { openAt: number; closeAt: number };
  /** The ceremony's circuits, in session order (from `init.json`). */
  circuits: CircuitName[];
  queue: QueueEntry[];
  /** By GitHub id (decimal string). */
  identities: Record<string, IdentityStanding>;
  slot: Slot | null;
  nextSeq: number;
}

/** Everything that changes the queue. `tick` is the Durable Object alarm. */
export type QueueEvent =
  | { type: "tick" }
  | { type: "join"; githubId: number; invited?: boolean }
  | { type: "leave"; githubId: number }
  | { type: "claim"; githubId: number }
  | { type: "heartbeat"; githubId: number }
  | { type: "uploaded"; githubId: number; circuit: CircuitName }
  /** A result for upload `attempt` of `circuit` in session `seq`: anything else is stale. */
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
  /** The operator lifts an identity's hold after reviewing its `infra` releases. */
  | { type: "unhold"; githubId: number }
  /** Only with the sealed beacon and the finals, checked by `checkFinalize`. */
  | { type: "finalize" };

/**
 * Why a session ended. `infra`: the verifier failed on it repeatedly (it counts like a no-show).
 */
export type ReleaseReason = "finished" | "no-show" | "timeout" | "banned" | "closed" | "infra";

/** What the Durable Object must do after a step; the state is already updated. */
export type QueueEffect =
  | { type: "grant"; githubId: number; seq: number }
  | { type: "release"; githubId: number; seq: number; reason: ReleaseReason }
  | { type: "dispatch"; githubId: number; seq: number; circuit: CircuitName; attempt: number }
  | { type: "accepted"; githubId: number; seq: number; circuit: CircuitName }
  | { type: "state"; from: CeremonyState; to: CeremonyState; reason: string }
  /** CLOSED → FINALIZED: recorded by the sealed beacon, the transcript's last record. */
  | { type: "finalized" };

/** Why an event was refused; the state is unchanged. */
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
  /** The ceremony is sealed: read-only. */
  | "finalized";

/** The outcome of one step. */
export type StepResult =
  | { ok: true; state: QueueState; effects: QueueEffect[] }
  | { ok: false; state: QueueState; refusal: QueueRefusal };
