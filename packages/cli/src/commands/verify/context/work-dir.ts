/** A scratch directory inside the stage for builds (compiling, rebuilding the genesis). */
import { join } from "node:path";
import type { VerifyContext } from "../types";

export const workDir = (ctx: VerifyContext) => join(ctx.stage.dir, "work");
