/**
 * Text from outside made safe for a terminal: escape sequences and bidi controls become `?`, so
 * nothing can move the cursor, recolour or hide what is printed. Replaced are C0 controls but tab
 * and newline, DEL, C1 controls, and the invisible format characters a terminal would render as
 * nothing (bidi marks, overrides and isolates, zero-width characters, line and paragraph
 * separators, the BOM). Other Unicode stays readable.
 */
// oxlint-disable-next-line no-control-regex
const CONTROL = /[\x00-\x08\x0b-\x1f\x7f-\x9f\u061c\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g;

export const stripControl = (text: string): string => text.replace(CONTROL, "?");
