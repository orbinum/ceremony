/**
 * One snarkjs operation in its own child process (`worker.ts`), bounded by `limitsFor`. A limit
 * hit is an `IsolationError`; the operation's own error (a malformed file) is a plain `Error`
 * carrying the child's `code`; the answer is checked against `REPLY_CHECKS`.
 */
import { fileURLToPath } from "node:url";
import { runIsolated } from "../../isolate";
import { limitsFor } from "./limits-for";
import { REPLY_CHECKS } from "./reply-checks";
import type { LimitsOverride, SnarkjsOps, SnarkjsTask } from "../types";

const WORKER = fileURLToPath(new URL("./worker.ts", import.meta.url));

export const callWorker = <K extends keyof SnarkjsOps>(
  op: K,
  args: Parameters<SnarkjsOps[K]>,
  limits?: LimitsOverride,
  entries = 0,
) =>
  runIsolated<SnarkjsTask, Awaited<ReturnType<SnarkjsOps[K]>>>(
    WORKER,
    { op, args } as SnarkjsTask,
    limitsFor(op, limits, entries),
    REPLY_CHECKS[op],
  );
