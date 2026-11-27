/** Runs an external program that must succeed; returns its stdout. */
import { runTool } from "./run-tool";
import { toolFailure } from "./tool-failure";
import type { ToolOptions } from "./types";

export async function run(
  cmd: string,
  args: readonly string[],
  options: ToolOptions = {},
): Promise<string> {
  const r = await runTool(cmd, args, options);
  if (r.code !== 0) throw toolFailure(cmd, r);
  return r.stdout;
}
