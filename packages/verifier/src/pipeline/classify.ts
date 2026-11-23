/** Who is at fault when verifying an upload throws: the verifier (`infra`) or the file. SPEC §2.5. */
import { IsolationError } from "../isolate";

/**
 * Errno codes that mean "the host ran out of something or failed", not "the upload is bad": file
 * descriptors, memory and buffers, disk space and quota, file-size limits, a read-only, stale or
 * busy filesystem, a temporary shortage. A missing or unreadable file is not on the list: our own
 * files (the staged upload included) are re-checked before the upload is blamed.
 */
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
/** The same failures by message: an errno prefix, or V8's out-of-memory and wasm-memory errors. */
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

/**
 * Who is at fault when snarkjs throws while verifying an upload (SPEC §2.5). Resource exhaustion
 * is ours → `infra` (pause, nobody penalized), recognized by its `code` (carried over from the
 * child) or the message's errno prefix. Anything else is the file's → `rejected`: our own inputs
 * were checked readable beforehand, and treating it as `infra` would let a crafted upload pause
 * the ceremony at will.
 */
export function classifyVerifierError(error: unknown): "infra" | "rejected" {
  // A time or memory bound hit: an honest upload verifies in seconds, but a slow or loaded host
  // is ours to fix. Repeated infra releases the session (SPEC §4.2), so this cannot stall it.
  if (error instanceof IsolationError) return "infra";
  const e = error as { code?: unknown; message?: unknown } | null;
  if (typeof e?.code === "string" && RESOURCE_CODES.has(e.code)) return "infra";
  if (typeof e?.message === "string" && RESOURCE_MESSAGE.test(e.message)) return "infra";
  return "rejected";
}
