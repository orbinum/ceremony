/**
 * UTF-8 bytes to a string, strictly: invalid UTF-8 throws `TypeError`. A byte-order mark is kept
 * in the text, so a pinned document that starts with one is not canonical.
 */
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

export const fromUtf8 = (bytes: Uint8Array): string => decoder.decode(bytes);
