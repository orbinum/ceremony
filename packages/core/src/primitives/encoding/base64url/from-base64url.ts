/** base64url (padding optional) to bytes; any other text is a `FormatError`. */
import { FormatError } from "../../errors";

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
