/** Wraps a @noble/hashes incremental hash as a `StreamingHasher` that digests to lowercase hex. */
import { toHex } from "../encoding";
import type { StreamingHasher } from "./types";

export function streaming(create: () => { update(b: Uint8Array): unknown; digest(): Uint8Array }) {
  return (): StreamingHasher => {
    const inner = create();
    const hasher: StreamingHasher = {
      update(chunk) {
        inner.update(chunk);
        return hasher;
      },
      digestHex: () => toHex(inner.digest()),
    };
    return hasher;
  };
}
