/** `status.json`: what a status page shows of the ceremony, without identities. */
import type { CircuitName } from "../../config";
import { type Chained, circuitsOf, headChain, type Setup } from "../../ceremony";
import { headOfSetup } from "./head-of-setup";
import { publicStatusOf } from "./public-status-of";
import type { QueueState } from "./types";

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
