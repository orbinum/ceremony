/**
 * Private copies of untrusted inputs, in a fresh 0700 directory (`mkdtemp`). Everything that is
 * hashed and then used (by our checks or by snarkjs) is the same read-only copy, so the source
 * cannot change between check and use; symlinks, devices or oversized files are refused before a
 * byte is copied, from the same descriptor the copy reads. With a `root`, a source that lies under
 * it by name must also lie under it on disk: `O_NOFOLLOW` covers the last component, and this
 * covers a symlinked parent directory (`final -> /elsewhere`). A source that shrinks while copied
 * ends the stream early without an error, so the copy's size is checked afterwards.
 */
import { createWriteStream } from "node:fs";
import { mkdtemp, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { MAX_FILE_BYTES } from "@orbinum-ceremony/core";
import { openRegular } from "./read";

export interface Stage {
  dir: string;
  copy(source: string, name: string, maxBytes?: number): Promise<string>;
  cleanup(): Promise<void>;
}

const inside = (root: string, path: string) => {
  const r = relative(root, path);
  return r !== "" && !r.startsWith(`..${sep}`) && r !== ".." && !r.startsWith(sep);
};

export async function createStage(prefix = "orbinum-stage-", root?: string): Promise<Stage> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  let realRoot: string | undefined;
  try {
    realRoot = root === undefined ? undefined : await realpath(resolve(root));
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
  return {
    dir,
    async copy(source, name, maxBytes = MAX_FILE_BYTES) {
      if (name === "" || name.includes("/") || name.startsWith(".")) {
        throw new Error(`bad stage name ${name}`);
      }
      if (root !== undefined && realRoot !== undefined && inside(resolve(root), resolve(source))) {
        if (!inside(realRoot, join(await realpath(dirname(resolve(source))), "x"))) {
          throw new Error(`${name}: a parent directory leaves the ceremony directory`);
        }
      }
      const [handle, size] = await openRegular(source, maxBytes, name);
      try {
        const target = join(dir, name);
        if (size === 0) {
          await writeFile(target, new Uint8Array(), { flag: "wx", mode: 0o400 });
        } else {
          await pipeline(
            handle.createReadStream({ start: 0, end: size - 1, autoClose: false }),
            createWriteStream(target, { flags: "wx", mode: 0o400 }),
          );
        }
        if ((await stat(target)).size !== size) throw new Error(`${name}: changed while copied`);
        return target;
      } finally {
        await handle.close();
      }
    },
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}
