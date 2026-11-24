/**
 * External programs (git, tar, circom, the vk packer, the Rust verifier): no shell, a timeout, a
 * bounded output, and a minimal environment, so secrets in the operator's shell (an Access token)
 * never reach them. Errors name the program and its redacted stderr, never the argv.
 */
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { basename } from "node:path";
import { redact } from "../io";

/** Long enough for circom on the largest circuit; a hung tool must not hang the CLI. */
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
/** After SIGTERM at the timeout, how long a tool has to exit before SIGKILL. */
const KILL_GRACE_MS = 2000;

/** What a tool inherits from our environment: enough to find itself and its temp dir. */
const ENV_KEPT = ["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "SystemRoot"] as const;

/** The environment passed to every tool. */
export const toolEnv = (env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv =>
  Object.fromEntries(ENV_KEPT.flatMap((k) => (env[k] === undefined ? [] : [[k, env[k]]])));

/** How a tool ended: its exit code, or the signal that killed it, and its output. */
export interface ToolResult {
  code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
}

/** How to run a tool: its working directory and bounds. */
export interface ToolOptions {
  cwd?: string;
  timeoutMs?: number;
  /** Bound on stdout and stderr together (default 64 MiB). */
  maxOutputBytes?: number;
}

/** "exit 3" or "killed by SIGKILL". */
export const howItEnded = (r: ToolResult): string =>
  r.signal ? `killed by ${r.signal}` : `exit ${r.code}`;

/** Signals the tool's whole process group (it leads one), so its children stop with it. */
function signalGroup(pid: number | undefined, signal: NodeJS.Signals): void {
  if (pid === undefined) return;
  try {
    process.kill(-pid, signal);
  } catch {}
}

/** Runs a program; resolves with its raw output once every stream closed. */
function spawnTool(
  cmd: string,
  args: readonly string[],
  options: ToolOptions,
): Promise<{ code: number | null; signal: string | null; stdout: Buffer; stderr: Buffer }> {
  const maxBytes = options.maxOutputBytes ?? MAX_OUTPUT_BYTES;
  return new Promise((resolve, reject) => {
    // Its own process group: a timeout kills the tool and everything it started.
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
      // A spawn error (ENOENT, EACCES); its message would carry argv.
      reject(new Error(`${cmd} could not run (${String(error.code)})`, { cause: error }));
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      // A late exit is a failure even with code 0: its output came after the bound.
      if (failure) reject(failure);
      else resolve({ code, signal, stdout: Buffer.concat(out), stderr: Buffer.concat(err) });
    });
  });
}

/**
 * Runs a program and returns how it ended, whatever its exit code. Throws only when it could not
 * run, timed out or overflowed its output.
 */
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

const failed = (cmd: string, r: ToolResult) =>
  new Error(`${cmd} failed (${howItEnded(r)}): ${redact(r.stderr.trim())}`);

/** Runs a program that must succeed; returns its stdout. */
export async function run(
  cmd: string,
  args: readonly string[],
  options: ToolOptions = {},
): Promise<string> {
  const r = await runTool(cmd, args, options);
  if (r.code !== 0) throw failed(cmd, r);
  return r.stdout;
}

/** Runs a program that must succeed; returns its stdout as bytes (binary-safe). */
export async function runBytes(
  cmd: string,
  args: readonly string[],
  options: ToolOptions = {},
): Promise<Uint8Array> {
  const r = await spawnTool(cmd, args, options);
  if (r.code !== 0) {
    throw failed(cmd, { ...r, stdout: "", stderr: r.stderr.toString("utf8") });
  }
  return r.stdout;
}

/** Throws unless `bin` exists and is executable: checked before anything irreversible. */
export async function assertExecutable(bin: string): Promise<void> {
  try {
    await access(bin, constants.X_OK);
  } catch {
    throw new Error(`${basename(bin)} is not an executable file`);
  }
}
