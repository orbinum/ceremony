/** Throws unless the r1cs or genesis file on disk is the one `init.json` records for `circuit`. */
import { type CircuitName, createSha256, type InitRecord, pinOf } from "@orbinum-ceremony/core";
import { hashFile } from "../files";

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
