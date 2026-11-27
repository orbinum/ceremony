/** Runs an external program that must succeed; returns its stdout as bytes (binary-safe). */
import { spawnTool } from "./spawn-tool";
import { toolFailure } from "./tool-failure";
import type { ToolOptions } from "./types";

export async function runBytes(
  cmd: string,
  args: readonly string[],
  options: ToolOptions = {},
): Promise<Uint8Array> {
  const r = await spawnTool(cmd, args, options);
  if (r.code !== 0) {
    throw toolFailure(cmd, { ...r, stdout: "", stderr: r.stderr.toString("utf8") });
  }
  return r.stdout;
}
