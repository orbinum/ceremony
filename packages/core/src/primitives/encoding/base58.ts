/** Base58 with the Bitcoin alphabet, as SS58 addresses use it. */

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** `bytes` in base58 (each leading zero byte is a leading `1`). */
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
      .map((d) => ALPHABET[d])
      .join("")
  );
}

/** The bytes of a base58 text (each leading `1` is a leading zero byte); throws on a non-digit. */
export function fromBase58(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const char of text) {
    let carry = ALPHABET.indexOf(char);
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
