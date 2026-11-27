/** Lowercase hex of exactly `bytes` bytes, the canonical form of every hash read from outside. */
import { fail } from "./fail";

const HEX_BY_BYTES = new Map<number, RegExp>();

export function asHex(value: unknown, path: string, bytes: number): string {
  let pattern = HEX_BY_BYTES.get(bytes);
  if (!pattern) HEX_BY_BYTES.set(bytes, (pattern = new RegExp(`^[0-9a-f]{${bytes * 2}}$`)));
  if (typeof value !== "string" || !pattern.test(value)) {
    return fail(path, `expected ${bytes}-byte lowercase hex`);
  }
  return value;
}
