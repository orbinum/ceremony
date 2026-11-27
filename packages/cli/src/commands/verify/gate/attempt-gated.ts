/**
 * Runs an expensive check only if its circuit and the ptau passed every prerequisite so far;
 * otherwise reports it failed and names what failed first.
 */
import type { CircuitName } from "@orbinum-ceremony/core";
import type { Report } from "../../../ui";
import { PTAU_PREREQUISITE } from "./constants";
import type { Failed } from "./types";

export async function attemptGated(
  report: Report,
  failed: Failed,
  circuit: CircuitName,
  id: string,
  fn: () => Promise<string[] | void>,
): Promise<boolean> {
  const blocked = [...(failed.get(PTAU_PREREQUISITE) ?? []), ...(failed.get(circuit) ?? [])];
  if (blocked.length > 0) {
    report.fail(id, `not run: prerequisite failed (${blocked[0]})`);
    return false;
  }
  return report.attempt(id, fn);
}
