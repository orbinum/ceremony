/**
 * Streams a regular file through a hasher, never fully buffered, and exactly the size it had when
 * opened: the bytes hashed are the bytes checked.
 */
import { MAX_FILE_BYTES, type StreamingHasher } from "@orbinum-ceremony/core";
import { changedWhileRead } from "./changed-while-read";
import { openRegular } from "./open-regular";

export async function hashFile(
  path: string,
  hasher: StreamingHasher,
  maxBytes = MAX_FILE_BYTES,
): Promise<string> {
  const [handle, size] = await openRegular(path, maxBytes);
  try {
    let read = 0;
    if (size > 0) {
      const stream = handle.createReadStream({ start: 0, end: size - 1, autoClose: false });
      for await (const chunk of stream) {
        hasher.update(chunk as Uint8Array);
        read += (chunk as Uint8Array).length;
      }
    }
    if (read !== size) throw changedWhileRead(path);
    return hasher.digestHex();
  } finally {
    await handle.close();
  }
}
