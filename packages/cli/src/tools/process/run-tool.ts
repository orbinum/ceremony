/**
 * Runs an external program and returns how it ended, whatever its exit code. Throws only when it
 * could not run, timed out or overflowed its output.
 */
import { spawnTool } from "./spawn-tool";
import type { ToolOptions, ToolResult } from "./types";

export async function runTool(
  cmd: string,
  args: readonly string[],
  options: ToolOptions = {},
): Promise<ToolResult> {
  const r = await spawnTool(cmd, args, options);
  return {
    code: r.code,
    signal: r.signal,
    stdout: r.stdout.toString("utf8"),
    stderr: r.stderr.toString("utf8"),
  };
}
