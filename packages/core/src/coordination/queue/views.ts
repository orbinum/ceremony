/** Read-only views of the queue for routes, the status page and the job store. */
import { type CircuitName, QUEUE_RULES } from "../../config";
import {
  CEREMONY_LAYOUT,
  type Chained,
  circuitsOf,
  genesisOf,
  headChain,
  headOf,
  type Setup,
} from "../../ceremony";
import { verifying } from "./slot";
import type { QueueRules, QueueState, SlotCircuit } from "./types";

/** What a contributor sees of their own place: position in line, or their session. */
export function slotView(state: QueueState, githubId: number, rules: QueueRules = QUEUE_RULES) {
  const position = state.queue.findIndex((e) => e.githubId === githubId);
  const slot = state.slot?.githubId === githubId ? state.slot : null;
  return {
    phase: state.phase,
    position: position === -1 ? null : position + 1,
    slot: slot && {
      seq: slot.seq,
      claimed: slot.claimedAt !== null,
      claimBy: slot.claimedAt === null ? slot.grantedAt + rules.claimWindowMs : null,
      circuits: slot.circuits.map(({ circuit, status, attempts }: SlotCircuit) => ({
        circuit,
        status,
        attempts,
      })),
    },
  };
}

/** Whether upload `attempt` of `circuit` in session `seq` is the one being verified now. */
export function isCurrentVerification(
  state: QueueState,
  job: { seq: number; circuit: CircuitName; attempt: number },
): boolean {
  const entry = state.slot && verifying(state.slot);
  return (
    state.slot?.seq === job.seq && entry?.circuit === job.circuit && entry.uploads === job.attempt
  );
}

/**
 * `GET /api/status`: the live phase and counts, without identities or chain values. `sessions`
 * counts turns given, including ones that ended with nothing accepted (a no-show, a rejection);
 * `contributors`, the accounts with at least one accepted contribution.
 */
export const publicStatusOf = (state: QueueState) => ({
  phase: state.phase,
  queued: state.queue.length,
  active: state.slot !== null,
  sessions: state.nextSeq - 1,
  contributors: Object.values(state.identities).filter((i) => i.accepted.length > 0).length,
});

/** The head a contributor downloads before extending a circuit. */
export const headView = (head: { index: number; outputSha256: string }, circuit: CircuitName) => ({
  index: head.index,
  output_sha256: head.outputSha256,
  url: `/artifacts/${CEREMONY_LAYOUT.zkey(circuit, head.index)}`,
});

/** A circuit's head in a configured ceremony; null if the ceremony does not have the circuit. */
export function headOfSetup(setup: Setup, records: readonly Chained[], circuit: CircuitName) {
  const genesis = genesisOf(setup, circuit);
  return genesis
    ? headOf(records, circuit, { sha256: genesis.genesis_sha256, csHash: genesis.cs_hash })
    : null;
}

/** `status.json`: what a status page shows, without identities. */
export function statusOf(setup: Setup, state: QueueState, records: readonly Chained[]) {
  const heads: Partial<Record<CircuitName, { index: number; output_sha256: string }>> = {};
  for (const c of circuitsOf(setup.init)) {
    const head = headOfSetup(setup, records, c);
    if (head) heads[c] = { index: head.index, output_sha256: head.outputSha256 };
  }
  return {
    ceremony_id: setup.announcement.ceremony_id,
    ...publicStatusOf(state),
    heads,
    records: records.length,
    head_chain: headChain(records, setup.chainGenesis),
  };
}
