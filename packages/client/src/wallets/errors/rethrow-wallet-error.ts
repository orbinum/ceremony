/** Rethrows a provider error as a `WalletError` when its EIP-1193 code has a clearer wording. */
import { UNAUTHORIZED, USER_REJECTED } from "../constants";
import { codeOf } from "./code-of";
import { WalletError } from "./wallet-error";

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
