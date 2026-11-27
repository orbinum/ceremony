/** The accepted contributions of one circuit, in chain order. */
import type { CircuitName } from "../../../config";
import type { Chained, ContributionRecord } from "../types";

export const contributionsOf = (records: readonly Chained[], circuit: CircuitName) =>
  records.filter(
    (r): r is Chained<ContributionRecord> => r.type === "contribution" && r.circuit === circuit,
  );
