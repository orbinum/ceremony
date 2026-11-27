/** The key of one contribution's local metrics: `<circuit>/<index>`. */
import type { CircuitName } from "@orbinum-ceremony/core";

export const metricsKey = (circuit: CircuitName, index: number) => `${circuit}/${index}`;
