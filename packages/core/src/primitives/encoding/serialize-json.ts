/**
 * The bytes of a published JSON document, as every tool writes them: two-space indentation and a
 * final newline. A pinned document must be exactly this serialization of its validated value.
 */
export const serializeJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
