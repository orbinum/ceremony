/** A SHA-256 given on the command line (64 hex characters, any case), returned lowercase. */
import { normalizeHex } from "@orbinum-ceremony/core";
import { UsageError } from "./usage-error";

export function sha256Option(value: string, flag: string): string {
  try {
    return normalizeHex(value, `--${flag}`, 32);
  } catch {
    throw new UsageError(`--${flag} must be a SHA-256 (64 hex characters)`);
  }
}
