/**
 * The verdict of this turn's upload of exactly `outputSha256` (any upload of the turn when null),
 * polled until it has one. A job that ended without an outcome yet (`null`) is as good as pending.
 */
import type { CircuitName } from "@orbinum-ceremony/core";
import { POLL_MS, VERDICT_FOR_MS } from "./constants";
import { retrying } from "./retry";
import type { RunDeps, Verdict } from "./types";

export async function settled(
  deps: RunDeps,
  circuit: CircuitName,
  seq: number,
  outputSha256: string | null,
): Promise<{ status: NonNullable<Verdict>; reason?: string }> {
  const deadline = Date.now() + VERDICT_FOR_MS;
  while (Date.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop
    const r = await retrying(() => deps.api.getResult(circuit), deps.sleep);
    const ours = r.seq === seq && (outputSha256 === null || r.output_sha256 === outputSha256);
    if (ours && r.status !== "pending" && r.status !== null) {
      return { status: r.status, reason: r.reason };
    }
    // oxlint-disable-next-line no-await-in-loop
    await deps.sleep(POLL_MS);
  }
  throw new Error(`${circuit}: no verdict after ${VERDICT_FOR_MS / 60_000} minutes`);
}
