/** A download written to a new file, refused as soon as it passes its byte bound. SPEC §7. */
import { createWriteStream } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * Writes `body` to `dest` (created exclusively), failing once more than `maxBytes` arrive;
 * returns the number of bytes written.
 */
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
