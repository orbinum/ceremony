/** The code a wallet provider attached to its error, if any. */
export const codeOf = (error: unknown): unknown => (error as { code?: unknown } | null)?.code;
