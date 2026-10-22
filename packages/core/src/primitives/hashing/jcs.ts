/** RFC 8785 (JCS) canonical JSON: the only serialization ever hashed or signed. SPEC §3.3. */
import canonicalize from "canonicalize";
import { FormatError } from "../errors";

/**
 * Canonical JSON of `value`; NaN, Infinity, bigint, lone surrogates and `undefined` raise
 * `FormatError`.
 */
export function canonicalJson(value: unknown): string {
  let out: string | undefined;
  try {
    out = canonicalize(value);
  } catch (error) {
    throw new FormatError(`not JCS-serializable: ${(error as Error).message}`, { cause: error });
  }
  if (out === undefined) throw new FormatError("value has no JSON representation");
  return out;
}
