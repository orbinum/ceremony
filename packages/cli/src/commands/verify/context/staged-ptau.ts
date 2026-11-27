/** The staged ptau, or a throw like `staged`. */
import type { VerifyContext } from "../types";

export const stagedPtau = (ctx: VerifyContext): string => {
  if (!ctx.files.ptau) throw new Error("ptau could not be staged");
  return ctx.files.ptau;
};
