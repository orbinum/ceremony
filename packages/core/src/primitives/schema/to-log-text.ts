/** A log made publishable: printable ASCII, tabs and newlines, bounded to `max` characters. */
export const toLogText = (text: string, max: number): string =>
  text.replace(/[^\t\n\x20-\x7e]/g, "?").slice(0, max);
