/**
 * git, read-only on the verifier's own clone: refs resolved to full commits, files and trees at a
 * commit.
 */
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { asCommit } from "@orbinum-ceremony/core";
import { ensureDir } from "../io";
import { run, runBytes } from "./process";

/**
 * Full commit id a ref (tag or commit) points to. `--end-of-options` stops refs that look like
 * options; the result is validated as a 40-hex id before it is used anywhere else.
 */
export const resolveCommit = async (repo: string, ref: string): Promise<string> =>
  asCommit(
    (
      await run("git", ["-C", repo, "rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`])
    ).trim(),
    `git ref ${ref}`,
  );

/** A file's content at a commit, without touching the working tree. */
export const showFile = (repo: string, commit: string, path: string): Promise<string> =>
  run("git", ["-C", repo, "show", `${asCommit(commit, "commit")}:${path}`]);

/** The URL the clone's `origin` remote fetches from. */
export const originUrl = async (repo: string): Promise<string> =>
  (await run("git", ["-C", repo, "remote", "get-url", "origin"])).trim();

/** A tree path that stays inside the export: no empty, `.`, `..` or `.git` component. */
const safePath = (path: string) =>
  path.split("/").every((p) => p !== "" && p !== "." && p !== ".." && p.toLowerCase() !== ".git");

/**
 * Exports the tree at `commit` into `dest`, every blob byte-for-byte as committed (no checkout, no
 * worktree). Not `git archive`: it applies the tree's own `.gitattributes`, so `export-subst`
 * would rewrite sources with commit metadata and `export-ignore` would drop files, and what is
 * compiled would not be what a reviewer reads. Links and submodules are refused.
 */
export async function exportTree(repo: string, commit: string, dest: string): Promise<void> {
  const id = asCommit(commit, "commit");
  const listing = await run("git", ["-C", repo, "ls-tree", "-r", "-z", "--full-tree", id]);
  for (const entry of listing.split("\0").filter(Boolean)) {
    const tab = entry.indexOf("\t");
    const [mode, type, blob] = entry.slice(0, tab).split(" ");
    const path = entry.slice(tab + 1);
    if (type !== "blob" || (mode !== "100644" && mode !== "100755") || !safePath(path)) {
      throw new Error(`release tree: ${JSON.stringify(path)} (${type} ${mode}) is not exported`);
    }
    const out = join(dest, ...path.split("/"));
    /* oxlint-disable no-await-in-loop -- one blob at a time, in tree order */
    await ensureDir(dirname(out));
    const bytes = await runBytes("git", ["-C", repo, "cat-file", "blob", asBlob(blob)]);
    await writeFile(out, bytes, { flag: "wx", mode: mode === "100755" ? 0o755 : 0o644 });
    /* oxlint-enable no-await-in-loop */
  }
}

const asBlob = (id: string | undefined): string => {
  if (!id || !/^[0-9a-f]{40}([0-9a-f]{24})?$/.test(id))
    throw new Error("release tree: bad blob id");
  return id;
};
