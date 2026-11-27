/** A string as UTF-8 bytes. */
const encoder = new TextEncoder();

export const utf8 = (text: string): Uint8Array => encoder.encode(text);
