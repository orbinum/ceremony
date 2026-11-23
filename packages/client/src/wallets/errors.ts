/**
 * Wallet errors a contributor can act on. EIP-1193 codes: 4001 the user rejected the request,
 * 4100 the account is not authorized for this site (a locked wallet, or a dropped permission).
 */

export const USER_REJECTED = 4001;
export const UNAUTHORIZED = 4100;

/** A wallet failure with its EIP-1193 code, worded for the page. */
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

/** The code a provider attached to its error, if any. */
export const codeOf = (error: unknown): unknown => (error as { code?: unknown } | null)?.code;

/** Rethrows a provider error as a `WalletError` when its code has a clearer wording. */
export function rethrowWalletError(error: unknown): never {
  const code = codeOf(error);
  if (code === USER_REJECTED) {
    throw new WalletError("You declined the request in your wallet.", USER_REJECTED, {
      cause: error,
    });
  }
  if (code === UNAUTHORIZED) {
    throw new WalletError(
      "Your wallet has not authorized this account here. Unlock it, select the account and retry.",
      UNAUTHORIZED,
      { cause: error },
    );
  }
  throw error;
}

/** The linked wallet cannot be told apart from the others: the user has to pick it. */
export class ChooseWallet extends Error {
  override readonly name = "ChooseWallet";
}
