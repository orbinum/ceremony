/** The `init.json` pin check of an r1cs or genesis on bytes already read. */
import { type CircuitName, type InitRecord, pinOf, sha256Hex } from "@orbinum-ceremony/core";

export function assertPinnedBytes(
  init: InitRecord,
  circuit: CircuitName,
  kind: "genesis" | "r1cs",
  bytes: Uint8Array,
): void {
  if (sha256Hex(bytes) !== pinOf(init, circuit, kind)) {
    throw new Error(`${circuit} ${kind} does not match init.json`);
  }
}
