/** The message of any thrown value, redacted, so it can be printed or reported as is. */
import { redact } from "./redact";

export const errorMessage = (error: unknown): string =>
  redact(error instanceof Error ? error.message : String(error));
