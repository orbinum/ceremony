/**
 * Runs one task in a child process, bounded in time and memory. Used for every snarkjs call on
 * untrusted input: a crafted zkey or r1cs can at worst fail its own task, never hang or exhaust the
 * process that judges it. Forks `entry` (a module calling `serveOnce`) and sends `task`; `check`
 * validates the answer's value, and a reply of the wrong shape (the child's message is not trusted
 * blindly) is an `IsolationError("crashed")`. The task's own error is a plain `Error` carrying the
 * child's `code`, if any.
 *
 * The child inherits only PATH, TMPDIR and NODE_ENV: it parses attacker bytes, so no secret may
 * reach it. Its JS heap is capped at 1 GiB (real use ≤ 30 MB; the resident bound is the
 * watchdog's). The TypeScript loader is resolved from this package, not the cwd, so a child forked
 * from any directory (systemd's default is `/`) still starts. `error` is listened to with `on`,
 * since a second one without a listener would crash this process; the end is read on `close`, not
 * `exit`, when the answer and stderr have been read.
 */
import { fork } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { stripControl } from "@orbinum-ceremony/core";
import { redact } from "../text";
import { EXIT_OUT_OF_MEMORY } from "./constants";
import { IsolationError } from "./isolation-error";
import { liveChildren } from "./live-children";
import type { Limits, ReplyMessage, TaskMessage } from "./types";

const HEAP_MB = 1024;

const MAX_STDERR = 2048;

const TSX_LOADER = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;

const CHILD_ENV = ["PATH", "TMPDIR", "NODE_ENV"] as const;

const childEnv = (): NodeJS.ProcessEnv =>
  Object.fromEntries(
    CHILD_ENV.flatMap((k) => (process.env[k] === undefined ? [] : [[k, process.env[k]]])),
  );

function readReply(raw: unknown): ReplyMessage<unknown> | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  if (r.ok === true) return { ok: true, value: r.value };
  if (r.ok !== false || typeof r.error !== "string") return undefined;
  if (r.code !== undefined && typeof r.code !== "string") return undefined;
  return { ok: false, error: r.error, ...(r.code === undefined ? {} : { code: r.code }) };
}

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
    liveChildren.add(child);
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
      liveChildren.delete(child);
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
    child.on("error", (error) => crashed(`could not run: ${redact(error.message)}`));
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
