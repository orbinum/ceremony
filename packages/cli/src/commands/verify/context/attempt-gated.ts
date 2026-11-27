/** Runs an expensive check of `circuit` in the verification context only if its prerequisites passed. */
import type { CircuitName } from "@orbinum-ceremony/core";
import { attemptGated as attemptGatedIn } from "../gate";
import type { VerifyContext } from "../types";

export const attemptGated = (
  ctx: VerifyContext,
  circuit: CircuitName,
  id: string,
  fn: () => Promise<string[] | void>,
) => attemptGatedIn(ctx.report, ctx.failed, circuit, id, fn);
