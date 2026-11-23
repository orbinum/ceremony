/** Private copies of untrusted inputs, made once and used for every check. SPEC §7. */
import { createWriteStream } from "node:fs";
import { mkdtemp, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { MAX_FILE_BYTES } from "@orbinum-ceremony/core";
import { openRegular } from "./read";

/**
 * Private copies of untrusted inputs. Everything that is hashed and then used (by our checks or by
 * snarkjs) is the same copy, so the source cannot change between check and use, and symlinks,
 * devices or oversized files are refused before a byte is copied (SPEC §7). With a `root`, a source
 * that lies under it by name must also lie under it on disk: a symlinked parent directory
 * (`final -> /elsewhere`) cannot redirect the copy.
 */
export interface Stage {
  /** The private directory (0700, from `mkdtemp`). */
  dir: string;
  /** Copies `source` to `<dir>/<name>` (read-only, never overwriting); returns the copy's path. */
  copy(source: string, name: string, maxBytes?: number): Promise<string>;
  /** Removes the directory and every copy in it. */
  cleanup(): Promise<void>;
}

const inside = (root: string, path: string) => {
  const r = relative(root, path);
  return r !== "" && !r.startsWith(`..${sep}`) && r !== ".." && !r.startsWith(sep);
};

/** A fresh private directory; with `root`, copies from under it must stay under it on disk. */
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
        // O_NOFOLLOW below covers the last component; this covers the directories above it.
        if (!inside(realRoot, join(await realpath(dirname(resolve(source))), "x"))) {
          throw new Error(`${name}: a parent directory leaves the ceremony directory`);
        }
      }
      // One descriptor, checked then copied: the file checked is the file copied.
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
        // A source that shrank while it was copied ends the stream early, without an error.
        if ((await stat(target)).size !== size) throw new Error(`${name}: changed while copied`);
        return target;
      } finally {
        await handle.close();
      }
    },
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}
