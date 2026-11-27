/** `POST /admin/unhold`: the GitHub id whose hold the operator lifts. */
import { asRecord, asSafeInt } from "../../primitives/schema";

export function validateUnholdRequest(v: unknown): { githubId: number } {
  const o = asRecord(v, "unhold", ["githubId"]);
  return { githubId: asSafeInt(o.githubId, "unhold.githubId", 1, Number.MAX_SAFE_INTEGER) };
}
