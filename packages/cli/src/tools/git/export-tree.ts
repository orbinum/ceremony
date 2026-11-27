/**
 * Exports the tree at a commit into `dest`, every blob byte-for-byte as committed (no checkout, no
 * worktree). Not `git archive`: it applies the tree's own `.gitattributes`, so `export-subst` would
 * rewrite sources with commit metadata and `export-ignore` would drop files, and what is compiled
 * would not be what a reviewer reads. Links and submodules are refused, and so is any path that
 * could leave the export: an empty, `.` or `..` component, or `.git` in every spelling git's own
 * `verify_path` refuses (any case, code points HFS+ ignores, trailing dots or spaces that NTFS
 * drops, and the NTFS short name `git~1`).
 */
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { asCommit } from "@orbinum-ceremony/core";
import { ensureDir } from "../../io";
import { run, runBytes } from "../process";

const HFS_IGNORED = /[\u200C-\u200F\u202A-\u202E\u206A-\u206F\uFEFF]/g;

const isGitDir = (part: string) => {
  const name = part
    .replace(HFS_IGNORED, "")
    .replace(/[. ]+$/, "")
    .toLowerCase();
  return name === ".git" || name === "git~1";
};

const safePath = (path: string) =>
  path.split("/").every((p) => p !== "" && p !== "." && p !== ".." && !isGitDir(p));

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
    await ensureDir(dirname(out));
    const bytes = await runBytes("git", ["-C", repo, "cat-file", "blob", asBlob(blob)]);
    await writeFile(out, bytes, { flag: "wx", mode: mode === "100755" ? 0o755 : 0o644 });
  }
}

const asBlob = (id: string | undefined): string => {
  if (!id || !/^[0-9a-f]{40}([0-9a-f]{24})?$/.test(id))
    throw new Error("release tree: bad blob id");
  return id;
};
