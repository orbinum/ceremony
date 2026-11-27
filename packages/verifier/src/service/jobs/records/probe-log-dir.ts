/**
 * Creates LOG_DIR and proves it writable with a probe file: at startup, so an unusable LOG_DIR
 * stops the service instead of turning every job into `infra` after its verification.
 */
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { writeAtomic } from "../../../files";
import { errorMessage } from "../../../text";

export async function probeLogDir(logDir: string): Promise<void> {
  const probe = join(logDir, `.probe-${process.pid}`);
  try {
    await writeAtomic(probe, "");
    await rm(probe);
  } catch (error) {
    throw new Error(`LOG_DIR: not writable: ${errorMessage(error)}`, { cause: error });
  }
}
