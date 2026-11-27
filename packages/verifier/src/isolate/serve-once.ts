/**
 * The child side of an isolated task: serves exactly one task with `handler`, replies with its
 * value or with the message (and string `code`, such as `EMFILE`) of what it threw, and exits once
 * the reply is on its way. A watchdog exits with `EXIT_OUT_OF_MEMORY` once resident memory passes
 * the bound: snarkjs keeps its data in WASM and buffers outside the JS heap, so a heap limit alone
 * does not bound it. The child also exits when the parent goes away (the IPC channel closes), so
 * no orphan keeps working. Light on purpose: snarkjs's worker imports it directly.
 */
import { EXIT_OUT_OF_MEMORY } from "./constants";
import type { ReplyMessage, TaskMessage } from "./types";

const WATCHDOG_MS = 100;

const reply = <R>(r: ReplyMessage<R>) => process.send?.(r, () => process.exit(0));

const failure = (error: unknown): ReplyMessage<never> => {
  const code = (error as { code?: unknown } | null)?.code;
  return {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    ...(typeof code === "string" ? { code } : {}),
  };
};

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
