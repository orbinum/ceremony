/**
 * Prerequisites of the expensive checks: a circuit (or the ptau every circuit needs) that failed a
 * cheap check has its snarkjs and Rust checks reported failed, not run on input known to be wrong.
 */
import type { CircuitName } from "@orbinum-ceremony/core";
import type { Report } from "../../ui";

/** The ptau's key among the failures: not a circuit name (`ptau` is one), so it shadows none. */
export const PTAU_PREREQUISITE = "#ptau";

/** The cheap checks each circuit (or the ptau) failed, by id. */
export type Failed = Map<CircuitName | typeof PTAU_PREREQUISITE, string[]>;

/** Records that `circuit` (or the ptau) failed the check `id`. */
export const markFailed = (
  failed: Failed,
  circuit: CircuitName | typeof PTAU_PREREQUISITE,
  id: string,
) => failed.set(circuit, [...(failed.get(circuit) ?? []), id]);

/**
 * Runs an expensive check only if its circuit and the ptau passed every prerequisite so far;
 * otherwise reports it failed and names what failed first.
 */
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
