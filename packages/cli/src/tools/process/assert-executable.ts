/** Throws unless `bin` exists and is executable: checked before anything irreversible. */
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { basename } from "node:path";

export async function assertExecutable(bin: string): Promise<void> {
  try {
    await access(bin, constants.X_OK);
  } catch {
    throw new Error(`${basename(bin)} is not an executable file`);
  }
}
