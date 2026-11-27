/** An integer option within `[min, max]`. */
import { UsageError } from "./usage-error";

export function intOption(value: string, flag: string, min: number, max: number): number {
  const n = /^[0-9]{1,16}$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    throw new UsageError(`--${flag} must be an integer from ${min} to ${max}`);
  }
  return n;
}
