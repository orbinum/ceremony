/**
 * A download written to `dest` (created exclusively), refused as soon as more than `maxBytes`
 * arrive; returns the number of bytes written.
 */
import { createWriteStream } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export async function cappedToFile(
  body: ReadableStream<Uint8Array>,
  dest: string,
  maxBytes: number,
): Promise<number> {
  let seen = 0;
  const cap = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      seen += chunk.length;
      done(seen > maxBytes ? new Error(`more than ${maxBytes} bytes`) : null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(body as never), cap, createWriteStream(dest, { flags: "wx" }));
  return seen;
}
