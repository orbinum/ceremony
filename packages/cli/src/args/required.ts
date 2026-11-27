/** The value of a required option, or a `UsageError` naming the missing flag. */
import { UsageError } from "./usage-error";

export function required(value: string | undefined, flag: string): string {
  if (!value) throw new UsageError(`missing --${flag}`);
  return value;
}
