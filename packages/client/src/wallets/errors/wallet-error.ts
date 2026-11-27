/** A wallet failure a contributor can act on, worded for the page, with its EIP-1193 code. */
export class WalletError extends Error {
  override readonly name = "WalletError";

  constructor(
    message: string,
    readonly code?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
