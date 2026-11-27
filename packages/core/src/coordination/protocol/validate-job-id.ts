/** A job id from JSON numbers or route parameters: canonical decimal strings only. */
import { asCircuitName, asDecimalId } from "../../primitives/schema";
import type { JobId } from "./types";

export function validateJobId(v: Record<string, unknown>, p = "job"): JobId {
  return {
    seq: asDecimalId(v.seq, `${p}.seq`),
    circuit: asCircuitName(v.circuit, `${p}.circuit`),
    attempt: asDecimalId(v.attempt, `${p}.attempt`),
  };
}
