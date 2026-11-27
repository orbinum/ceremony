/**
 * How circuits exceed what the session and verifier bounds were measured for, per circuit and in
 * total; empty when they fit.
 */
import { MEASURED_CIRCUITS } from "../../../config";
import type { InitCircuit } from "../types";

export function checkMeasuredBounds(
  circuits: readonly Pick<InitCircuit, "name" | "constraints">[],
): string[] {
  const problems: string[] = [];
  for (const c of circuits) {
    if (c.constraints > MEASURED_CIRCUITS.maxConstraints) {
      problems.push(
        `${c.name}: ${c.constraints} constraints, the bounds were measured up to ${MEASURED_CIRCUITS.maxConstraints}`,
      );
    }
  }
  const total = circuits.reduce((sum, c) => sum + c.constraints, 0);
  if (total > MEASURED_CIRCUITS.maxTotalConstraints) {
    problems.push(
      `${total} constraints in all, the bounds were measured up to ${MEASURED_CIRCUITS.maxTotalConstraints}`,
    );
  }
  return problems;
}
