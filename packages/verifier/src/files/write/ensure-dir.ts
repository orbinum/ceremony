/** `mkdir -p`: creates a directory and its parents, and is a no-op when it exists. */
import { mkdir } from "node:fs/promises";

export const ensureDir = (path: string): Promise<string | undefined> =>
  mkdir(path, { recursive: true });
