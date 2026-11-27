/** A shared secret as MAC key bytes; one shorter than `MIN_KEY_BYTES` is a configuration error. */
import { MIN_KEY_BYTES } from "../../../config";
import { utf8 } from "../../encoding";

export function keyBytes(key: string, what: string): Uint8Array {
  const bytes = typeof key === "string" ? utf8(key) : new Uint8Array();
  if (bytes.length < MIN_KEY_BYTES)
    throw new Error(`${what} must be at least ${MIN_KEY_BYTES} bytes`);
  return bytes;
}
