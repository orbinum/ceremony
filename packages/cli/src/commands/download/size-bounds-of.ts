/**
 * The largest each file the transcript names may be: an accepted zkey is at most its genesis plus
 * 1 KiB per entry, a log at most `MAX_LOG_CHARS`, so a mirror cannot fill the disk with files no
 * coordinator could have accepted. A zkey's bound needs its genesis, fetched first.
 */
import { stat } from "node:fs/promises";
import { join } from "node:path";
import {
  CEREMONY_LAYOUT,
  MAX_FILE_BYTES,
  MAX_LOG_CHARS,
  maxUploadSize,
  type Transcript,
} from "@orbinum-ceremony/core";

export function sizeBoundsOf(dir: string, transcript: Transcript) {
  const bounds = new Map<string, () => Promise<number>>();
  for (const r of transcript.records) {
    if (r.type !== "contribution") continue;
    const genesis = join(dir, CEREMONY_LAYOUT.zkey(r.circuit, 0));
    bounds.set(CEREMONY_LAYOUT.zkey(r.circuit, r.index), async () =>
      maxUploadSize((await stat(genesis)).size, r.index),
    );
    bounds.set(CEREMONY_LAYOUT.log(r.circuit, r.index), async () => MAX_LOG_CHARS);
  }
  return async (key: string) => (await bounds.get(key)?.()) ?? MAX_FILE_BYTES;
}
