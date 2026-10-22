/**
 * The child side of an isolated task: answers one message and exits. A watchdog exits with
 * `EXIT_OUT_OF_MEMORY` once resident memory passes the bound: snarkjs keeps its data in WASM and
 * buffers outside the JS heap, so a heap limit alone does not bound it. KL-33.
 */
import type { Limits } from "./limits";

/** Exit code of a child stopped by its memory watchdog. */
export const EXIT_OUT_OF_MEMORY = 75;

/** What the parent sends. */
export interface TaskMessage<T> {
  task: T;
  maxRssBytes: Limits["maxRssBytes"];
}

/** What the child answers: a value, or the message (and `code`, if any) of what it threw. */
export type ReplyMessage<R> = { ok: true; value: R } | { ok: false; error: string; code?: string };

const WATCHDOG_MS = 100;

/** Sends the answer, then exits once it is on its way. */
const reply = <R>(r: ReplyMessage<R>) => process.send?.(r, () => process.exit(0));

/** A thrown value as a reply: its message, and its `code` when it is a string (`EMFILE`, …). */
const failure = (error: unknown): ReplyMessage<never> => {
  const code = (error as { code?: unknown } | null)?.code;
  return {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    ...(typeof code === "string" ? { code } : {}),
  };
};

/**
 * Serves exactly one task with `handler`, under the memory watchdog, then exits. It also exits
 * when the parent goes away (the IPC channel closes), so no orphan keeps working.
 */
export function serveOnce<T, R>(handler: (task: T) => Promise<R>): void {
  process.once("disconnect", () => process.exit(0));
  process.once("message", (message: TaskMessage<T>) => {
    const watchdog = setInterval(() => {
      if (process.memoryUsage.rss() > message.maxRssBytes) process.exit(EXIT_OUT_OF_MEMORY);
    }, WATCHDOG_MS);
    watchdog.unref();
    handler(message.task).then(
      (value) => reply<R>({ ok: true, value }),
      (error: unknown) => reply(failure(error)),
    );
  });
}
