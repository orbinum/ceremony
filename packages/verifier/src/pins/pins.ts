/**
 * Files against their pins: the ptau against config, r1cs and genesis against init.json.
 * SPEC §1.3, §6.1.
 */
import {
  blake2b512Hex,
  type CircuitName,
  createBlake2b512,
  createSha256,
  type InitRecord,
  pinOf,
  PTAU,
  sha256Hex,
} from "@orbinum-ceremony/core";
import { assertRegularFile, hashFile } from "../files";

/** Throws unless the ptau's size and BLAKE2b-512 match the pin. */
export async function assertPinnedPtau(path: string): Promise<void> {
  const size = await assertRegularFile(path, PTAU.sizeBytes);
  if (size !== PTAU.sizeBytes) throw new Error(`ptau size ${size}, expected ${PTAU.sizeBytes}`);
  const hash = await hashFile(path, createBlake2b512(), PTAU.sizeBytes);
  if (hash !== PTAU.blake2b512) throw new Error("ptau BLAKE2b-512 does not match the pin");
}

/** The same check on bytes already read (the bytes that will be used). */
export function assertPtauBytes(bytes: Uint8Array): void {
  if (bytes.length !== PTAU.sizeBytes || blake2b512Hex(bytes) !== PTAU.blake2b512) {
    throw new Error("ptau does not match the pin");
  }
}

/** Throws unless the file on disk is the one recorded in `init.json` for `circuit`. */
export async function assertPinnedFile(
  init: InitRecord,
  circuit: CircuitName,
  kind: "genesis" | "r1cs",
  path: string,
): Promise<void> {
  if ((await hashFile(path, createSha256())) !== pinOf(init, circuit, kind)) {
    throw new Error(`${circuit} ${kind} does not match init.json`);
  }
}

/** The same check on bytes already read. */
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
