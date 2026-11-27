/**
 * Opens a file that may come from outside, once, and checks the open descriptor: a regular file
 * within `maxBytes`. Symlinks (which could point at `/dev/zero` or another file mid-run), devices
 * and FIFOs (no hang: the open is non-blocking) are refused on the descriptor itself, so whoever
 * reads from the returned handle, up to the returned size, reads the file that was checked. Errors
 * name the file as `label`.
 */
import { constants } from "node:fs";
import { type FileHandle, open } from "node:fs/promises";
import { basename } from "node:path";

const READ_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;

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
