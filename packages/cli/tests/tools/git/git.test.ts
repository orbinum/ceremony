/** git on the verifier's clone: the exported tree is the committed bytes, nothing else. */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exportTree, originUrl, showFile } from "../../../src/tools";
import { rejection } from "../../support";

let work: string;
const git = (repo: string, ...args: string[]) =>
  execFileSync("git", ["-C", repo, "-c", "commit.gpgSign=false", ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@t",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@t",
    },
  }).trim();

async function repoWith(files: Record<string, string>, link?: [string, string]) {
  const repo = await mkdtemp(join(work, "repo-"));
  git(repo, "init", "-q");
  for (const [path, text] of Object.entries(files)) {
    await mkdir(join(repo, path, ".."), { recursive: true });
    await writeFile(join(repo, path), text);
  }
  if (link) await symlink(link[1], join(repo, link[0]));
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "*/ injected();  /*");
  return { repo, commit: git(repo, "rev-parse", "HEAD") };
}

beforeAll(async () => {
  work = await mkdtemp(join(tmpdir(), "orbinum-git-"));
});
afterAll(() => rm(work, { recursive: true, force: true }));

describe("exporting the release tree", () => {
  it("writes every blob as committed, ignoring export-subst and export-ignore", async () => {
    const source = "/* build: $Format:%s$ */\ntemplate T() {}\n";
    const { repo, commit } = await repoWith({
      ".gitattributes": "circuits/*.circom export-subst\nhidden.circom export-ignore\n",
      "circuits/shield.circom": source,
      "hidden.circom": "template H() {}\n",
    });
    const out = await mkdtemp(join(work, "out-"));
    await exportTree(repo, commit, out);
    const exported = await readFile(join(out, "circuits", "shield.circom"), "utf8");
    expect(exported).toBe(await showFile(repo, commit, "circuits/shield.circom"));
    expect(exported).toBe(source);
    expect(existsSync(join(out, "hidden.circom"))).toBe(true);
  });

  it("refuses a link in the tree instead of exporting it", async () => {
    const { repo, commit } = await repoWith({ "a.circom": "x" }, ["b.circom", "/etc/passwd"]);
    const out = await mkdtemp(join(work, "out-"));
    expect((await rejection(exportTree(repo, commit, out))).message).toBe(
      'release tree: "b.circom" (blob 120000) is not exported',
    );
  });

  it("reads the clone's origin", async () => {
    const { repo } = await repoWith({ "a.circom": "x" });
    git(repo, "remote", "add", "origin", "git@github.com:orbinum/circuits.git");
    expect(await originUrl(repo)).toBe("git@github.com:orbinum/circuits.git");
  });
});
