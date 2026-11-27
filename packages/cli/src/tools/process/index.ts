/**
 * Running an external program: no shell, bounded in time and output, a minimal environment, and
 * a failure that names how it ended with its redacted stderr, never argv.
 */
export { assertExecutable } from "./assert-executable";
export { howItEnded } from "./how-it-ended";
export { run } from "./run";
export { runBytes } from "./run-bytes";
export { runTool } from "./run-tool";
export { toolEnv } from "./tool-env";
export type { ToolOptions, ToolResult } from "./types";
