/**
 * How an external tool is run (working directory, timeout, a bound on stdout and stderr together)
 * and how it ended (exit code or killing signal, and its output).
 */

export interface ToolResult {
  code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
}

export interface ToolOptions {
  cwd?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}
