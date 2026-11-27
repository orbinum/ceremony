/**
 * The contributions of one turn, circuit by circuit in the queue's order and one at a time,
 * following the queue's own rules: a turn whose every circuit is done closes itself; an upload of
 * an earlier attempt still in verification settles first, and if accepted it is only reported, so
 * the caller signs it by name (its hashes are not known here); a pause waits for the operator; a
 * rejection is tried again while the slot offers the circuit; `ambiguous` is tried again and
 * `infra` and `stale` (the verifier failed, the attempt given back) wait for the coordinator.
 * Returns this run's accepted contributions; throws if the turn is lost or a check fails, and
 * nothing more is uploaded then.
 */
import type { CircuitName } from "@orbinum-ceremony/core";
import { MAX_ATTEMPTS, POLL_MS } from "./constants";
import { contributeTo } from "./contribute-to";
import { retrying } from "./retry";
import { settled } from "./settled";
import type { Accepted, Progress, RunDeps } from "./types";

export async function contributeAll(
  deps: RunDeps,
  seq: number,
  report: (p: Progress) => void,
): Promise<Accepted[]> {
  const accepted = new Map<CircuitName, Accepted>();
  const attempts = new Map<CircuitName, number>();
  for (;;) {
    const lost = deps.lost();
    if (lost) throw lost;
    // oxlint-disable-next-line no-await-in-loop
    const view = await retrying(() => deps.api.getSlot(), deps.sleep);
    if (!view.slot || view.slot.seq !== seq) break;
    const pending = view.slot.circuits.find((c) => c.status === "verifying");
    if (pending) {
      // oxlint-disable-next-line no-await-in-loop
      const verdict = await settled(deps, pending.circuit, seq, null);
      if (verdict.status === "valid") report({ circuit: pending.circuit, stage: "accepted" });
      continue;
    }
    const next = view.slot.circuits.find((c) => c.status === "todo");
    if (!next) break;
    if (view.phase !== "OPEN") {
      report({ circuit: null, stage: "paused" });
      // oxlint-disable-next-line no-await-in-loop
      await deps.sleep(POLL_MS);
      continue;
    }
    const { circuit } = next;
    const tries = (attempts.get(circuit) ?? 0) + 1;
    if (tries > MAX_ATTEMPTS) throw new Error(`${circuit}: no verdict after ${MAX_ATTEMPTS} tries`);
    attempts.set(circuit, tries);
    // oxlint-disable-next-line no-await-in-loop
    const attempt = await contributeTo(deps, circuit, seq, report);
    if (attempt?.verdict === "valid") {
      accepted.set(circuit, attempt.accepted);
      report({ circuit, stage: "accepted" });
      continue;
    }
    if (attempt === null) {
      report({ circuit, stage: "retrying", detail: "the upload did not go through" });
    } else if (attempt.verdict === "rejected") {
      report({ circuit, stage: "rejected", detail: attempt.reason });
    } else {
      report({ circuit, stage: "retrying", detail: attempt.verdict });
    }
    // oxlint-disable-next-line no-await-in-loop
    await deps.sleep(POLL_MS);
  }
  return [...accepted.values()];
}
