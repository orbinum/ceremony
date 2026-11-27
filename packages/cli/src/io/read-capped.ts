/**
 * The body of a response, refused as soon as it passes `maxBytes` (declared or actual): the bound
 * applies while reading, so a hostile server cannot make us buffer more than it allows.
 */
import { asSafeInt } from "@orbinum-ceremony/core";

export async function readCapped(
  res: Response,
  maxBytes: number,
  what: string,
): Promise<Uint8Array> {
  const declared = res.headers.get("content-length");
  if (
    declared !== null &&
    asSafeInt(Number(declared), `${what} content-length`, 0, Number.MAX_SAFE_INTEGER) > maxBytes
  ) {
    throw new Error(`${what}: response larger than ${maxBytes} bytes`);
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (res.body) {
    for await (const chunk of res.body) {
      size += chunk.length;
      if (size > maxBytes) throw new Error(`${what}: response larger than ${maxBytes} bytes`);
      chunks.push(chunk);
    }
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
