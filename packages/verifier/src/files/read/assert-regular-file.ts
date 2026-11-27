/** The size of a regular, readable file within `maxBytes`; throws otherwise. */
import { MAX_FILE_BYTES } from "@orbinum-ceremony/core";
import { openRegular } from "./open-regular";

export async function assertRegularFile(path: string, maxBytes = MAX_FILE_BYTES): Promise<number> {
  const [handle, size] = await openRegular(path, maxBytes);
  await handle.close();
  return size;
}
