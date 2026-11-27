/**
 * Refuses an ed25519 point that more than one secret could stand behind: it must be canonically
 * encoded and of prime order. The library default (ZIP-215, cofactored) also takes small-order and
 * torsion-mixed points, which let a keyless "key" verify anything and one secret sign for eight
 * keys, and its JS and wasm backends disagree on them (the Worker runs the JS one).
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import { FormatError } from "../../../primitives/errors";

export function primeOrderPoint(bytes: Uint8Array): void {
  const point = ed25519.Point.fromBytes(bytes, false);
  if (point.isSmallOrder() || !point.isTorsionFree()) {
    throw new FormatError("ed25519 point outside the prime-order subgroup");
  }
}
