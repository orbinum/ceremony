/** Bytes as base64url without padding (RFC 4648 §5), as JWTs and signed tokens carry them. */
export const toBase64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
