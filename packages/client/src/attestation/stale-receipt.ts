/**
 * The receipt (public and edge-cached) lags what this run saw accepted, so nothing is signed;
 * signing again a few seconds later works.
 */
export class StaleReceipt extends Error {
  override readonly name = "StaleReceipt";

  constructor() {
    super(
      "The published receipt does not match your accepted contributions yet. Wait a few seconds and sign again.",
    );
  }
}
