/** The one error type for malformed input. */

/**
 * Input that is not well formed: an iden3 binary file (truncated, wrong magic, bad section table
 * or content) or a document read from outside (wrong field, type or bound).
 */
export class FormatError extends Error {
  override readonly name = "FormatError";
}
