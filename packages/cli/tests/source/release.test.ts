/** The audited circuits release in the verifier's clone: tag, commit, manifest, export. */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exportSource, repoId, resolveRelease } from "../../src/source";
import { resolveCommit } from "../../src/tools";

const SHA = "ab".repeat(32);
const LOCK = (v: string) =>
  `importers:\n  .:\n    dependencies:\n      circomlib:\n        specifier: ${v}\n        version: ${v}\n`;

let repo: string;
let work: string;
let commit: string;
const git = (...args: string[]) =>
  execFileSync(
    "git",
    ["-C", repo, "-c", "commit.gpgSign=false", "-c", "tag.gpgSign=false", ...args],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "t",
        GIT_AUTHOR_EMAIL: "t@t",
        GIT_COMMITTER_NAME: "t",
        GIT_COMMITTER_EMAIL: "t@t",
      },
    },
  ).trim();

beforeAll(async () => {
  repo = await mkdtemp(join(tmpdir(), "orbinum-circuits-"));
  work = await mkdtemp(join(tmpdir(), "orbinum-work-"));
  git("init", "-q");
  await mkdir(join(repo, "circuits"));
  await writeFile(join(repo, "circuits", "shield.circom"), "pragma circom 2.2.3;\n");
  await writeFile(
    join(repo, "manifest.json"),
    JSON.stringify({
      circuits: {
        shield: { active_version: 1, versions: { "1": { artifacts: { r1cs: { sha256: SHA } } } } },
      },
    }),
  );
  await writeFile(join(repo, "pnpm-lock.yaml"), LOCK("2.0.5"));
  git("add", ".");
  git("commit", "-qm", "release");
  git("tag", "v1.0.0");
  commit = git("rev-parse", "HEAD");
  await mkdir(join(repo, "node_modules", "circomlib"), { recursive: true });
  await writeFile(join(repo, "node_modules", "circomlib", "package.json"), '{"version":"2.0.5"}');
});
afterAll(async () => {
  await rm(repo, { recursive: true, force: true });
  await rm(work, { recursive: true, force: true });
});

describe("the audited circuits release", () => {
  it("resolves a tag to its commit and reads what it published", async () => {
    const release = await resolveRelease(repo, "v1.0.0", commit);
    expect(release.commit).toBe(commit);
    expect(release.published("shield")).toEqual({ version: 1, r1csSha256: SHA });
    expect(() => release.published("transfer")).toThrow(/manifest\.circuits\.transfer/);
  });

  it("refuses a tag that is not the announced commit", async () => {
    await expect(resolveRelease(repo, "v1.0.0", "0".repeat(40))).rejects.toThrow(
      /not the announced/,
    );
  });

  it("never reads a ref as an option", async () => {
    const out = join(work, "written-by-git");
    await expect(resolveCommit(repo, `--output=${out}`)).rejects.toThrow(/git failed/);
    expect(existsSync(out)).toBe(false);
    expect(await resolveCommit(repo, "v1.0.0")).toBe(commit);
  });

  it("exports the tree and checks the installed circomlib against the lock", async () => {
    const source = await exportSource(await resolveRelease(repo, "v1.0.0"), work);
    expect(source.circomlib).toBe("2.0.5");
    expect(await readdir(join(source.dir, "circuits"))).toEqual(["shield.circom"]);

    await writeFile(join(repo, "node_modules", "circomlib", "package.json"), '{"version":"2.1.0"}');
    const other = await mkdtemp(join(tmpdir(), "orbinum-work-"));
    try {
      await expect(exportSource(await resolveRelease(repo, "v1.0.0"), other)).rejects.toThrow(
        "circomlib 2.1.0 installed, 2.0.5 locked at v1.0.0",
      );
    } finally {
      await writeFile(
        join(repo, "node_modules", "circomlib", "package.json"),
        '{"version":"2.0.5"}',
      );
      await rm(other, { recursive: true, force: true });
    }
  });

  it("compares remotes as repositories, whatever their spelling", () => {
    const id = "github.com/orbinum/circuits";
    for (const url of [
      "https://github.com/orbinum/circuits",
      "https://github.com/Orbinum/circuits.git/",
      "git@github.com:orbinum/circuits.git",
      "ssh://git@github.com/orbinum/circuits",
      "https://user:token@github.com/orbinum/circuits.git",
    ]) {
      expect(repoId(url)).toBe(id);
    }
    expect(repoId("https://github.com/orbinum-labs/circuits")).not.toBe(id);
    expect(repoId("git@evil.example:orbinum/circuits.git")).not.toBe(id);
  });
});
