/** Records that `circuit` (or the ptau) failed the cheap check `id`. */
import type { CircuitName } from "@orbinum-ceremony/core";
import type { PTAU_PREREQUISITE } from "./constants";
import type { Failed } from "./types";

export const markFailed = (
  failed: Failed,
  circuit: CircuitName | typeof PTAU_PREREQUISITE,
  id: string,
) => failed.set(circuit, [...(failed.get(circuit) ?? []), id]);
