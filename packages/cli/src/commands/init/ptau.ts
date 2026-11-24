/**
 * The pinned ptau for `init`: a given file, a copy already in the directory, or a download. SPEC
 * §1.3.
 */
import { existsSync } from "node:fs";
import { rename } from "node:fs/promises";
import { join } from "node:path";
import { PTAU } from "@orbinum-ceremony/core";
import { assertPinnedPtau, downloadFirst, ensureDir } from "../../io";

/**
 * Returns a local ptau that matches the pin, downloading it if needed. A file downloaded by this
 * run that fails the pin is moved aside (never over an earlier one), so the next run downloads it
 * again; a file that was already there, or given with `--ptau`, is left untouched.
 */
export async function obtainPtau(
  outDir: string,
  provided?: string,
  mirrors: readonly string[] = PTAU.mirrors,
): Promise<string> {
  if (provided) {
    await assertPinnedPtau(provided);
    return provided;
  }
  const path = join(outDir, "ptau", PTAU.file);
  const downloaded = !existsSync(path);
  if (downloaded) {
    await ensureDir(join(outDir, "ptau"));
    const url = await downloadFirst(mirrors, path, PTAU.sizeBytes).catch((error: unknown) => {
      throw new Error(unreachable(error), { cause: error });
    });
    console.log(`  downloaded from ${url}`);
  }
  try {
    await assertPinnedPtau(path);
  } catch (error) {
    if (!downloaded) throw new Error(`${path}: ${(error as Error).message}`, { cause: error });
    const aside = `${path}.rejected-${Date.now()}`;
    await rename(path, aside).catch(() => undefined);
    throw new Error(`downloaded ptau moved to ${aside}: ${(error as Error).message}`, {
      cause: error,
    });
  }
  return path;
}

/** No mirror answered: what to do, since any copy works once it matches the pin. */
function unreachable(error: unknown): string {
  return [
    `could not download ${PTAU.file}: ${(error as Error).message}`,
    "No mirror answered (Orbinum's copies, then the original Hermez hosts, 403 since September 2026).",
    "Any copy works: pass it with --ptau <file>. Its BLAKE2b-512 must be",
    `  ${PTAU.blake2b512}`,
    "(check with `b2sum -l 512 <file>`; init checks it as well).",
  ].join("\n");
}
