/** A mistake in how the command was called: the entry point prints the usage and exits 2. */
export class UsageError extends Error {
  override readonly name = "UsageError";
}
