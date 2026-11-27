/** Bytes in base58 (Bitcoin alphabet, as SS58 uses it); each leading zero byte is a leading `1`. */
import { BASE58_ALPHABET } from "./constants";

export function toBase58(bytes: Uint8Array): string {
  const digits: number[] = [];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += (digits[i] as number) << 8;
      digits[i] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    for (; carry > 0; carry = Math.floor(carry / 58)) digits.push(carry % 58);
  }
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  return (
    "1".repeat(zeros) +
    digits
      .toReversed()
      .map((d) => BASE58_ALPHABET[d])
      .join("")
  );
}
