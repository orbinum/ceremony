/**
 * Reading local files that may come from outside. Every read opens the path once (no symlink, no
 * FIFO hang), checks the open descriptor, and reads only from it and only up to the size it had
 * when opened, so the file checked is the file read. SPEC §7.
 */
import { constants } from "node:fs";
import { type FileHandle, open } from "node:fs/promises";
import { basename } from "node:path";
import {
  fromUtf8,
  MAX_FILE_BYTES,
  parseJsonText,
  type StreamingHasher,
} from "@orbinum-ceremony/core";

const READ_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;

/**
 * Opens a regular file within `maxBytes` and returns the handle and its size: symlinks (which
 * could point at `/dev/zero` or another file mid-run), devices and FIFOs are refused on the
 * descriptor itself. Errors name the file as `label`.
 */
export async function openRegular(
  path: string,
  maxBytes: number,
  label = basename(path),
): Promise<[FileHandle, number]> {
  const handle = await open(path, READ_FLAGS);
  try {
    const s = await handle.stat();
    if (!s.isFile()) throw new Error(`${label}: not a regular file`);
    if (s.size > maxBytes) throw new Error(`${label}: larger than ${maxBytes} bytes`);
    return [handle, s.size];
  } catch (error) {
    await handle.close();
    throw error;
  }
}

const changed = (path: string) => new Error(`${basename(path)}: changed while being read`);

/** The size of a regular, readable file within `maxBytes`; throws otherwise. */
export async function assertRegularFile(path: string, maxBytes = MAX_FILE_BYTES): Promise<number> {
  const [handle, size] = await openRegular(path, maxBytes);
  await handle.close();
  return size;
}

/** Streams a regular file through a hasher (never fully buffered), exactly its opened size. */
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
    if (read !== size) throw changed(path);
    return hasher.digestHex();
  } finally {
    await handle.close();
  }
}

/** A regular file's bytes, exactly the size it had when opened. */
export async function readBytes(path: string, maxBytes = MAX_FILE_BYTES): Promise<Uint8Array> {
  const [handle, size] = await openRegular(path, maxBytes);
  try {
    const bytes = new Uint8Array(size);
    let read = 0;
    while (read < size) {
      // oxlint-disable-next-line no-await-in-loop -- reads are sequential into one buffer
      const { bytesRead } = await handle.read(bytes, read, size - read, read);
      if (bytesRead === 0) throw changed(path);
      read += bytesRead;
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

/**
 * A JSON file read from outside: bounded, strict UTF-8, and an error that names the file and never
 * echoes its content. Returns the parsed value and the exact bytes it came from.
 */
export async function readJsonFile(
  path: string,
  maxBytes: number,
): Promise<{ value: unknown; bytes: Uint8Array }> {
  const bytes = await readBytes(path, maxBytes);
  let text: string;
  try {
    text = fromUtf8(bytes);
  } catch {
    throw new Error(`${basename(path)}: not valid UTF-8`);
  }
  return { value: parseJsonText(text, basename(path)), bytes };
}
