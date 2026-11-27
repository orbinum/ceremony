/**
 * Who is at fault when snarkjs throws while verifying an upload. Resource exhaustion is ours →
 * `infra` (pause, nobody penalized), recognized by its `code` (carried over from the child) or the
 * message's errno prefix, V8's out-of-memory or wasm-memory errors: file descriptors, memory and
 * buffers, disk space and quota, file-size limits, a read-only, stale or busy filesystem, a
 * temporary shortage. So is a time or memory bound hit (`IsolationError`): an honest upload
 * verifies in seconds, but a slow or loaded host is ours to fix, and repeated `infra` releases the
 * session, so this cannot stall it. Anything else is the file's → `rejected`: a missing or
 * unreadable file is not on the list, since our own inputs (the staged upload included) are
 * re-checked before the upload is blamed, and treating it as `infra` would let a crafted upload
 * pause the ceremony at will.
 */
import { IsolationError } from "../isolate";

const RESOURCE_ERRNO = [
  "EMFILE",
  "ENFILE",
  "ENOMEM",
  "ENOBUFS",
  "ENOSPC",
  "EDQUOT",
  "EFBIG",
  "EROFS",
  "EIO",
  "ESTALE",
  "EBUSY",
  "EAGAIN",
] as const;
const RESOURCE_CODES = new Set<string>([
  ...RESOURCE_ERRNO,
  "ERR_WORKER_OUT_OF_MEMORY",
  "ERR_WORKER_INIT_FAILED",
]);
const RESOURCE_MESSAGE = new RegExp(
  [
    String.raw`^(${RESOURCE_ERRNO.join("|")})\b`,
    "out of memory",
    "worker (terminated|exited)",
    "allocation failed",
    "could not allocate memory",
    "maximum memory size exceeded",
    "unable to grow instance memory",
    "cannot allocate wasm memory",
  ].join("|"),
  "i",
);

export function classifyVerifierError(error: unknown): "infra" | "rejected" {
  if (error instanceof IsolationError) return "infra";
  const e = error as { code?: unknown; message?: unknown } | null;
  if (typeof e?.code === "string" && RESOURCE_CODES.has(e.code)) return "infra";
  if (typeof e?.message === "string" && RESOURCE_MESSAGE.test(e.message)) return "infra";
  return "rejected";
}
