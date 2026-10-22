/**
 * Runs one task in a child process, bounded in time and memory. Used for every snarkjs call on
 * untrusted input: a crafted zkey or r1cs can at worst fail its own task, never hang or exhaust
 * the process that judges it. SPEC §7, KL-33.
 */
import { type ChildProcess, fork } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { stripControl } from "@orbinum-ceremony/core";
import { redact } from "../text";
import { EXIT_OUT_OF_MEMORY, type ReplyMessage, type TaskMessage } from "./child";
import type { Limits } from "./limits";

/** JS heap of a child; real use is ≤ 30 MB, the resident bound is enforced by the watchdog. */
const HEAP_MB = 1024;

/** Child stderr kept for the error. */
const MAX_STDERR = 2048;

/**
 * The TypeScript loader, resolved from this package rather than from the cwd: a child forked from
 * any directory (systemd's default is `/`) still starts.
 */
const TSX_LOADER = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;

/** The only variables a child inherits: it parses attacker bytes, so no secret may reach it. */
const CHILD_ENV = ["PATH", "TMPDIR", "NODE_ENV"] as const;

const childEnv = (): NodeJS.ProcessEnv =>
  Object.fromEntries(
    CHILD_ENV.flatMap((k) => (process.env[k] === undefined ? [] : [[k, process.env[k]]])),
  );

/** Why an isolated task produced no answer. */
export type IsolationFailure = "timeout" | "memory" | "crashed";

/**
 * The task was stopped or died: a resource problem, not the task's own error. `stderr` is what the
 * child printed (redacted, bounded); it stays out of the message, which may leave the host.
 */
export class IsolationError extends Error {
  override readonly name = "IsolationError";
  constructor(
    readonly failure: IsolationFailure,
    message: string,
    readonly stderr = "",
  ) {
    super(message);
  }
}

/** Children still running, so a shutting-down host can stop them. */
const live = new Set<ChildProcess>();

/** Kills every isolated task still running (on shutdown); their callers see `crashed`. */
export function terminateIsolated(): void {
  for (const child of live) child.kill("SIGKILL");
}

/** A reply of the expected shape, or undefined: the child's message is not trusted blindly. */
function readReply(raw: unknown): ReplyMessage<unknown> | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  if (r.ok === true) return { ok: true, value: r.value };
  if (r.ok !== false || typeof r.error !== "string") return undefined;
  if (r.code !== undefined && typeof r.code !== "string") return undefined;
  return { ok: false, error: r.error, ...(r.code === undefined ? {} : { code: r.code }) };
}

/**
 * Forks `entry` (a module calling `serveOnce`), sends `task`, and returns its answer. `check`
 * validates the answer's value; a reply of the wrong shape is an `IsolationError("crashed")`.
 * The task's own error is a plain `Error` carrying the child's `code`, if any.
 */
export function runIsolated<T, R>(
  entry: string,
  task: T,
  limits: Limits,
  check?: (value: unknown) => value is R,
): Promise<R> {
  return new Promise((resolve, reject) => {
    const child = fork(entry, {
      execArgv: ["--import", TSX_LOADER, `--max-old-space-size=${HEAP_MB}`],
      env: childEnv(),
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    live.add(child);
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < MAX_STDERR)
        stderr = (stderr + chunk.toString("utf8")).slice(0, MAX_STDERR);
    });
    const said = () => stripControl(redact(stderr.trim())).slice(0, MAX_STDERR);

    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      live.delete(child);
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      fn();
    };
    const crashed = (message: string, output = "") =>
      settle(() => reject(new IsolationError("crashed", message, output)));
    const timer = setTimeout(
      () =>
        settle(() =>
          reject(new IsolationError("timeout", `timed out after ${limits.timeoutMs / 1000} s`)),
        ),
      limits.timeoutMs,
    );

    child.once("message", (raw: unknown) => {
      const reply = readReply(raw);
      if (!reply) return crashed("malformed reply");
      if (reply.ok) {
        if (check && !check(reply.value)) return crashed("malformed reply value");
        return settle(() => resolve(reply.value as R));
      }
      const error = new Error(redact(reply.error));
      settle(() =>
        reject(reply.code === undefined ? error : Object.assign(error, { code: reply.code })),
      );
    });
    // `on`, not `once`: a second `error` without a listener would crash this process.
    child.on("error", (error) => crashed(`could not run: ${redact(error.message)}`));
    // `close`, not `exit`: by then the answer and stderr have been read.
    child.once("close", (code, signal) =>
      code === EXIT_OUT_OF_MEMORY
        ? settle(() =>
            reject(
              new IsolationError(
                "memory",
                `stopped above ${Math.round(limits.maxRssBytes / 1024 ** 2)} MB resident`,
              ),
            ),
          )
        : crashed(`exited (${signal ?? code}) without an answer`, said()),
    );
    const message: TaskMessage<T> = { task, maxRssBytes: limits.maxRssBytes };
    child.send(message, (error) => {
      if (error) crashed(`could not send the task: ${redact(error.message)}`);
    });
  });
}
