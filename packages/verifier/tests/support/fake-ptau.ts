/**
 * A stand-in ptau small enough for hermetic tests, and core with its ptau pin swapped for it: the
 * pinned-input checks then pass on the stand-in. Used from a `vi.mock` factory.
 */
import type * as Core from "@orbinum-ceremony/core";

/** The stand-in's whole content. */
export const FAKE_PTAU_TEXT = "a stand-in ptau, pinned for hermetic tests";

/**
 * `core` with `PTAU` pinning `FAKE_PTAU_TEXT` (size and BLAKE2b-512), and `checkInitAgainstConfig`
 * taking an init.json that pins the stand-in (core compares against its own pin internally).
 */
export function withFakePtau(core: typeof Core): typeof Core {
  const bytes = new TextEncoder().encode(FAKE_PTAU_TEXT);
  const fake = { sizeBytes: bytes.length, blake2b512: core.blake2b512Hex(bytes) };
  const real = {
    file: core.PTAU.file,
    blake2b512: core.PTAU.blake2b512,
    size: core.PTAU.sizeBytes,
  };
  return {
    ...core,
    PTAU: { ...core.PTAU, ...fake } as unknown as typeof core.PTAU,
    checkInitAgainstConfig: (init) =>
      core.checkInitAgainstConfig(
        init.ptau.blake2b512 === fake.blake2b512 ? { ...init, ptau: real } : init,
      ),
  };
}
