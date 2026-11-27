/**
 * The verdict of this session's latest upload of a circuit (of exactly `outputSha256` when given),
 * once it has one. A verdict takes seconds; past 15 minutes the coordinator's own deadline has long
 * passed.
 */
import type { CircuitName } from "@orbinum-ceremony/core";
import type { Contributor } from "../../io";
import { type Verdict, verdictOf } from "./coordinator";
import { sleep } from "./retry";

const RESULT_POLL_MS = 2_000;
const RESULT_TIMEOUT_MS = 15 * 60_000;

export async function settled(
  who: Contributor,
  circuit: CircuitName,
  seq: number,
  outputSha256: string | null,
  signal?: AbortSignal,
): Promise<Verdict> {
  const deadline = Date.now() + RESULT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const v = await verdictOf(who, circuit, signal);
    const ours = v && v.seq === seq && (outputSha256 === null || v.outputSha256 === outputSha256);
    if (ours && v.status !== "pending") return v;
    await sleep(RESULT_POLL_MS, signal);
  }
  throw new Error(`${circuit}: no verdict after ${RESULT_TIMEOUT_MS / 60_000} min`);
}
