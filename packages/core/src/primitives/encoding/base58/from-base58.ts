/**
 * The bytes of a base58 text (Bitcoin alphabet); each leading `1` is a leading zero byte. Throws on
 * a character outside the alphabet.
 */
import { BASE58_ALPHABET } from "./constants";

export function fromBase58(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const char of text) {
    let carry = BASE58_ALPHABET.indexOf(char);
    if (carry < 0) throw new Error("not base58");
    for (let i = 0; i < bytes.length; i++) {
      carry += (bytes[i] as number) * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    for (; carry > 0; carry >>= 8) bytes.push(carry & 0xff);
  }
  let zeros = 0;
  while (zeros < text.length && text[zeros] === "1") zeros++;
  const out = new Uint8Array(zeros + bytes.length);
  out.set(bytes.toReversed(), zeros);
  return out;
}
