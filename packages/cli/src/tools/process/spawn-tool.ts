/**
 * Runs an external program and resolves with its raw output once every stream closed: no shell, a
 * timeout (long enough for circom on the largest circuit, so a hung tool cannot hang the CLI), a
 * bound on its output, and a minimal environment. It leads its own process group, so a timeout
 * sends SIGTERM and, after a grace period, SIGKILL to the tool and everything it started. A spawn
 * error names the program and its code, never argv; a late exit is a failure even with code 0,
 * since its output came after the bound.
 */
import { spawn } from "node:child_process";
import { toolEnv } from "./tool-env";
import type { ToolOptions } from "./types";

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const KILL_GRACE_MS = 2000;

function signalGroup(pid: number | undefined, signal: NodeJS.Signals): void {
  if (pid === undefined) return;
  try {
    process.kill(-pid, signal);
  } catch {}
}

export function spawnTool(
  cmd: string,
  args: readonly string[],
  options: ToolOptions,
): Promise<{ code: number | null; signal: string | null; stdout: Buffer; stderr: Buffer }> {
  const maxBytes = options.maxOutputBytes ?? MAX_OUTPUT_BYTES;
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: options.cwd,
      env: toolEnv(),
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let size = 0;
    let failure: Error | undefined;
    let killTimer: NodeJS.Timeout | undefined;
    const stop = (error: Error) => {
      failure ??= error;
      signalGroup(child.pid, "SIGTERM");
      killTimer ??= setTimeout(() => signalGroup(child.pid, "SIGKILL"), KILL_GRACE_MS);
    };
    const timer = setTimeout(
      () => stop(new Error(`${cmd} timed out`)),
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    const collect = (into: Buffer[]) => (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) stop(new Error(`${cmd} wrote too much output`));
      else into.push(chunk);
    };
    child.stdout.on("data", collect(out));
    child.stderr.on("data", collect(err));
    child.once("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(new Error(`${cmd} could not run (${String(error.code)})`, { cause: error }));
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      if (failure) reject(failure);
      else resolve({ code, signal, stdout: Buffer.concat(out), stderr: Buffer.concat(err) });
    });
  });
}
