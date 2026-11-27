/**
 * Bounds-checked little-endian reads over a byte buffer: a cursor over `bytes[start, end)` whose
 * every read past `end` is a `FormatError`, never a wrap. `pos` is the offset into the whole
 * buffer; `bytesOf` returns a view, not a copy; `u64` must fit a JS safe integer (sizes, counts).
 */
import { FormatError } from "../../primitives/errors";

export class ByteReader {
  private readonly view: DataView;
  pos: number;

  constructor(
    private readonly bytes: Uint8Array,
    start = 0,
    readonly end = bytes.byteLength,
  ) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.pos = start;
  }

  private take(n: number): number {
    if (!Number.isSafeInteger(n) || n < 0 || this.pos + n > this.end) {
      throw new FormatError(`read past end at ${this.pos}`);
    }
    const at = this.pos;
    this.pos += n;
    return at;
  }

  bytesOf(n: number): Uint8Array {
    const at = this.take(n);
    return this.bytes.subarray(at, at + n);
  }

  u8(): number {
    return this.view.getUint8(this.take(1));
  }

  u32(): number {
    return this.view.getUint32(this.take(4), true);
  }

  u64(): number {
    const at = this.take(8);
    const value = this.view.getBigUint64(at, true);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new FormatError(`u64 too large at ${at}`);
    return Number(value);
  }
}
