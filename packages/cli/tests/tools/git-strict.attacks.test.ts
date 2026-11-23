/**
 * Attacks on strict verification and the circuits clone (SPEC §2.1, §6.2, §7): a tag that does not
 * bind its commit, option injection into git, hostile git drivers, and a substituted ptau.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildAnnouncement,
  CIRCUITS_REPO_URL,
  PTAU,
  serializeJson,
  validateAnnouncement,
} from "@orbinum-ceremony/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runVerify, type VerifyOptions } from "../../src/commands/verify";
import { repoId, resolveRelease } from "../../src/source";
import { exportTree, originUrl, resolveCommit, showFile } from "../../src/tools";
import { PTAU_PATH, type Synthetic, syntheticCeremony } from "../support";

let work: string;
const git = (repo: string, ...args: string[]) =>
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

let repo: string;
let tagged: string;
let unaudited: string;
const MARK = () => join(work, "pwned");

beforeAll(async () => {
  work = await mkdtemp(join(tmpdir(), "orbinum-attack-git-"));
  repo = join(work, "circuits");
  await mkdir(join(repo, "circuits"), { recursive: true });
  git(repo, "init", "-q", "-b", "main");
  await writeFile(join(repo, "circuits", "shield.circom"), "pragma circom 2.2.3; // audited\n");
  await writeFile(join(repo, "manifest.json"), JSON.stringify({ circuits: {} }));
  await writeFile(
    join(repo, "pnpm-lock.yaml"),
    "importers:\n  .:\n    dependencies:\n      circomlib:\n        specifier: 2.0.5\n        version: 2.0.5\n",
  );
  // Filters and textconv a hostile tree asks for; the clone's config defines them (worst case).
  await writeFile(join(repo, ".gitattributes"), "* filter=evil diff=evil\n");
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "release");
  git(repo, "tag", "v1.0.0");
  tagged = git(repo, "rev-parse", "HEAD");
  await writeFile(join(repo, "circuits", "shield.circom"), "pragma circom 2.2.3; // NOT audited\n");
  git(repo, "commit", "-qam", "unaudited change");
  unaudited = git(repo, "rev-parse", "HEAD");
  git(repo, "config", "filter.evil.smudge", `touch ${MARK()}`);
  git(repo, "config", "filter.evil.clean", `touch ${MARK()}`);
  git(repo, "config", "filter.evil.required", "true");
  git(repo, "config", "diff.evil.textconv", `sh -c 'touch ${MARK()}; cat'`);
  git(repo, "remote", "add", "origin", "https://github.com/orbinum/circuits.git");
});
afterAll(() => rm(work, { recursive: true, force: true }));

const announcementWith = (tag: string, commit: string) =>
  buildAnnouncement({
    ceremonyId: "attack-git",
    network: "testnet",
    initSha256: "00".repeat(32),
    circuitsSource: { repo: CIRCUITS_REPO_URL, tag, commit },
    minContributions: 1,
    open: new Date("2026-10-01T00:00:00Z"),
    close: new Date("2026-10-02T00:00:00Z"),
    beaconDelaySeconds: 3600,
  });

describe("the announced release in the verifier's clone", () => {
  it("binds a real tag to its commit", async () => {
    expect((await resolveRelease(repo, "v1.0.0", tagged)).commit).toBe(tagged);
    await expect(resolveRelease(repo, "v1.0.0", unaudited)).rejects.toThrow(/resolves to/);
  });

  it("refuses an announced 'tag' that is a commit id, a branch or HEAD", async () => {
    // Any of these would "resolve to the announced commit" for an untagged, unaudited commit: the
    // tag→commit binding holds only if the ref is a tag.
    const accepted: string[] = [];
    for (const tag of [unaudited, "main", "HEAD", unaudited.slice(0, 12)]) {
      try {
        validateAnnouncement(JSON.parse(serializeJson(announcementWith(tag, unaudited))));
        // oxlint-disable-next-line no-await-in-loop -- one ref at a time
        await resolveRelease(repo, tag, unaudited);
        accepted.push(tag);
      } catch {
        // refused: what the binding should do
      }
    }
    expect(accepted).toEqual([]);
  });

  it("refuses option injection through the ref (--end-of-options) and leaves no file", async () => {
    const out = join(work, "injected");
    for (const ref of [`--output=${out}`, `--upload-pack=touch ${out}`, "-h", "--git-dir=/"]) {
      // oxlint-disable-next-line no-await-in-loop -- one ref at a time
      await expect(resolveCommit(repo, ref)).rejects.toThrow(/git failed/);
    }
    expect(existsSync(out)).toBe(false);
    // The announcement validator refuses them first.
    expect(() =>
      validateAnnouncement(JSON.parse(serializeJson(announcementWith("--upload-pack=x", tagged)))),
    ).toThrow(/tag/);
  });

  it("refuses a repo path that looks like an option without running anything", async () => {
    await expect(resolveCommit("--upload-pack=touch /tmp/x", "v1.0.0")).rejects.toThrow(
      /cannot change to '--upload-pack/,
    );
  });

  it("refuses every spelling of .git that git itself refuses, in any tree it exports", async () => {
    const blob = execFileSync("git", ["-C", repo, "hash-object", "-w", "--stdin"], {
      input: "[core]\n",
      encoding: "utf8",
    }).trim();
    for (const name of [".GIT", ".g\u200Cit", "\uFEFF.git", ".git.", ".git ", "GIT~1"]) {
      // Built with plumbing: a porcelain `git add` refuses these names on its own.
      const tree = execFileSync("git", ["-C", repo, "mktree"], {
        input: `100644 blob ${blob}\t${name}\n`,
        encoding: "utf8",
      }).trim();
      const commit = git(repo, "commit-tree", tree, "-m", "hostile");
      // oxlint-disable-next-line no-await-in-loop -- one tree at a time
      await expect(
        exportTree(repo, commit, join(work, `export-${encodeURIComponent(name)}`)),
      ).rejects.toThrow(/is not exported/);
    }
  });

  it("never runs the clone's filter or textconv drivers, and exports the committed bytes", async () => {
    // The worktree is dirty (unaudited content) and every path is filtered; the export is the tag.
    await writeFile(join(repo, "circuits", "shield.circom"), "dirty worktree\n");
    const dest = join(work, "export");
    await exportTree(repo, tagged, dest);
    expect(await readFile(join(dest, "circuits", "shield.circom"), "utf8")).toBe(
      "pragma circom 2.2.3; // audited\n",
    );
    expect(await showFile(repo, tagged, "manifest.json")).toBe(JSON.stringify({ circuits: {} }));
    await resolveCommit(repo, "v1.0.0");
    await originUrl(repo);
    expect(existsSync(MARK())).toBe(false);
    git(repo, "checkout", "--", ".").toString();
  });

  it("compares the origin as normalised text: scheme, credentials, case and .git do not matter, the host does", () => {
    expect(repoId("github.com/orbinum/circuits")).toBe(repoId(CIRCUITS_REPO_URL));
    expect(repoId("HTTPS://user:tok@GitHub.com/Orbinum/Circuits.git/")).toBe(
      repoId(CIRCUITS_REPO_URL),
    );
    expect(repoId("https://github.com.evil.example/orbinum/circuits")).not.toBe(
      repoId(CIRCUITS_REPO_URL),
    );
    expect(repoId("https://github.com/orbinum/circuits@evil.example/x")).not.toBe(
      repoId(CIRCUITS_REPO_URL),
    );
  });
});

describe("strict verification on a synthetic testnet ceremony", { timeout: 120_000 }, () => {
  let c: Synthetic;
  const base = (extra: Partial<VerifyOptions> = {}): VerifyOptions => ({
    dir: c.dir,
    announcementSha256: c.announcementSha256,
    network: "testnet",
    ptau: join(c.dir, "no.ptau"),
    rebuildGenesis: false,
    local: false,
    ...extra,
  });
  const ptauCheck = async (ptau: string) =>
    (await runVerify(base({ ptau }))).checks.filter((x) => x.id.startsWith("ptau"));
  beforeAll(async () => {
    c = await syntheticCeremony({ network: "testnet" });
  });

  it("stops before anything else on --local for a testnet ceremony", async () => {
    const r = await runVerify(base({ local: true }));
    expect(r.ok).toBe(false);
    expect(r.checks.at(-1)).toMatchObject({
      id: "verification mode matches the announced network",
      status: "fail",
    });
  });

  it("fails, never skips, each check whose external input is missing", async () => {
    const r = await runVerify(base());
    const ids = [
      "circuits clone's origin is the announced repo",
      "announced tag resolves to the announced commit",
      "shield: r1cs is the one the release published",
      "shield: r1cs rebuilt from the release is identical",
      "shield: vk_hash = blake2_256(packed VK)",
      "shield: independent verifier (Rust, no snarkjs) agrees",
    ];
    const statuses = Object.fromEntries(
      ids.map((id) => [id, r.checks.find((x) => x.id === id)?.status]),
    );
    expect(statuses).toEqual(Object.fromEntries(ids.map((id) => [id, "fail"])));
    expect(r.checks.filter((x) => x.status === "skip").map((x) => x.id)).toEqual([
      "shield: genesis rebuilt from r1cs + ptau is identical",
    ]);
  });

  it("stops on a network other than the announced one", async () => {
    const r = await runVerify(base({ network: "mainnet" }));
    expect(r.checks.at(-1)).toMatchObject({
      id: "ceremony.json announces the expected network",
      status: "fail",
    });
  });

  describe.skipIf(!PTAU_PATH)("the ptau", () => {
    it("is judged by content: any name with the pinned bytes passes", async () => {
      const other = join(work, "renamed.ptau");
      await copyFile(PTAU_PATH as string, other);
      expect((await ptauCheck(other)).map((x) => x.status)).toEqual(["pass", "pass"]);
    });

    it("refuses the right name with other bytes", async () => {
      const dir = join(work, "fake-ptau");
      await mkdir(dir, { recursive: true });
      const fake = join(dir, PTAU.file);
      await writeFile(fake, "not a ptau");
      const checks = await ptauCheck(fake);
      expect(checks.find((x) => x.id === "ptau matches the pinned BLAKE2b-512")?.status).toBe(
        "fail",
      );
    });

    it("refuses a symlink to the pinned file (O_NOFOLLOW)", async () => {
      const dir = join(work, "linked-ptau");
      await mkdir(dir, { recursive: true });
      const link = join(dir, PTAU.file);
      await symlink(PTAU_PATH as string, link);
      const checks = await ptauCheck(link);
      expect(checks.map((x) => x.status)).toEqual(["fail", "fail"]);
    });
  });
});
