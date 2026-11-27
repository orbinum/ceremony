/** An Fq element in Montgomery little-endian, written canonical and big-endian at `out[offset]`. */
import { FQ_BYTES } from "../constants";
import { fqLemToBigInt } from "./fq-lem-to-big-int";

function bigIntToBe(v: bigint, out: Uint8Array, offset: number): void {
  for (let i = FQ_BYTES - 1; i >= 0; i--) {
    out[offset + i] = Number(v & 0xffn);
    v >>= 8n;
  }
}

export function fqLemToBe(lem: Uint8Array, out: Uint8Array, offset: number): void {
  bigIntToBe(fqLemToBigInt(lem), out, offset);
}
