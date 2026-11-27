/** Records in the verification context that `circuit` (or the ptau) failed the cheap check `id`. */
import type { CircuitName } from "@orbinum-ceremony/core";
import { markFailed as markFailedIn, type PTAU_PREREQUISITE } from "../gate";
import type { VerifyContext } from "../types";

export const markFailed = (
  ctx: VerifyContext,
  circuit: CircuitName | typeof PTAU_PREREQUISITE,
  id: string,
) => markFailedIn(ctx.failed, circuit, id);
