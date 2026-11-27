/**
 * A regular file's bytes, read only from the descriptor that was checked and exactly the size it
 * had when opened, so the file checked is the file read.
 */
import { MAX_FILE_BYTES } from "@orbinum-ceremony/core";
import { changedWhileRead } from "./changed-while-read";
import { openRegular } from "./open-regular";

export async function readBytes(path: string, maxBytes = MAX_FILE_BYTES): Promise<Uint8Array> {
  const [handle, size] = await openRegular(path, maxBytes);
  try {
    const bytes = new Uint8Array(size);
    let read = 0;
    while (read < size) {
      // oxlint-disable-next-line no-await-in-loop
      const { bytesRead } = await handle.read(bytes, read, size - read, read);
      if (bytesRead === 0) throw changedWhileRead(path);
      read += bytesRead;
    }
    return bytes;
  } finally {
    await handle.close();
  }
}
