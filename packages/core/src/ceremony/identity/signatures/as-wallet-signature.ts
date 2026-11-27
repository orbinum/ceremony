/** A signature as a wallet returns it (`0x` + hex, either case), of the exact size for its scheme. */
import { asString } from "../../../primitives/schema";
import { asStoredSignature } from "./as-stored-signature";
import { SIGNATURE_BYTES } from "../constants";
import type { Scheme } from "../types";

export function asWalletSignature(value: unknown, path: string, scheme: Scheme): string {
  const s = asString(value, path, 2 + 2 * Math.max(...SIGNATURE_BYTES[scheme]), /^0x[0-9a-fA-F]+$/);
  asStoredSignature(s.slice(2).toLowerCase(), path, scheme);
  return s;
}
