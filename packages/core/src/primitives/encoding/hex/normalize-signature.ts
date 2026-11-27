/** The one stored form of a wallet signature: lowercase, without `0x`. */
export const normalizeSignature = (signature: string): string =>
  signature.replace(/^0x/i, "").toLowerCase();
