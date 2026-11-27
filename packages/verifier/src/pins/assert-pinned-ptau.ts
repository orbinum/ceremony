/** Throws unless the ptau file's size and BLAKE2b-512 match the pin in config. */
import { createBlake2b512, PTAU } from "@orbinum-ceremony/core";
import { assertRegularFile, hashFile } from "../files";

export async function assertPinnedPtau(path: string): Promise<void> {
  const size = await assertRegularFile(path, PTAU.sizeBytes);
  if (size !== PTAU.sizeBytes) throw new Error(`ptau size ${size}, expected ${PTAU.sizeBytes}`);
  const hash = await hashFile(path, createBlake2b512(), PTAU.sizeBytes);
  if (hash !== PTAU.blake2b512) throw new Error("ptau BLAKE2b-512 does not match the pin");
}
