/** base64url without padding (RFC 4648 §5), as JWTs and signed tokens carry it. */
import { FormatError } from "../errors";

/** Bytes → base64url, no padding. */
export const toBase64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");

/** base64url (padding optional) → bytes; throws `FormatError` on any other text. */
export function fromBase64url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(text)) throw new FormatError("not base64url");
  try {
    return Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/")), (c) =>
      c.charCodeAt(0),
    );
  } catch {
    throw new FormatError("not base64url");
  }
}
