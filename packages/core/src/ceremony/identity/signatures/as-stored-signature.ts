/** A stored wallet signature: lowercase hex without `0x`, of the exact size for its scheme. */
import { FormatError } from "../../../primitives/errors";
import { asHex, asString } from "../../../primitives/schema";
import { SIGNATURE_BYTES } from "../constants";
import type { Scheme } from "../types";

export function asStoredSignature(value: unknown, path: string, scheme: Scheme): string {
  const sizes = SIGNATURE_BYTES[scheme];
  const s = asString(value, path, 2 * Math.max(...sizes));
  const bytes = s.length / 2;
  if (!sizes.includes(bytes)) throw new FormatError(`${path}: not a ${scheme} signature`);
  return asHex(s, path, bytes);
}
