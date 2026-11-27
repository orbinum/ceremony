/** Free text from outside made printable ASCII and bounded, for logs and error details. */
export const toPrintable = (text: string, max: number): string =>
  text.replace(/[^\x20-\x7e]/g, "?").slice(0, max);
