/**
 * `verify` on synthetic ceremonies: the pin, the expected network and mode, the summary, the exit
 * code, transcript tampering, and the circuits clone (origin, pinned circom flags).
 */
import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256Utf8, TOOLING } from "@orbinum-ceremony/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runVerify, verifyCommand, type VerifyOptions } from "../../../src/commands/verify";
import {
  failures,
  rewriteHistory,
  type Synthetic,
  syntheticCeremony,
  tamperedCopy,
} from "../../support";

const options = (c: Synthetic, extra: Partial<VerifyOptions> = {}): VerifyOptions => ({
  dir: c.dir,
  announcementSha256: c.announcementSha256,
  network: c.announcement.network,
  ptau: join(c.dir, "no.ptau"),
  rebuildGenesis: false,
  local: c.announcement.network === "local",
  ...extra,
});

const git = (cwd: string, ...args: string[]) =>
  execFileSync(
    "git",
    ["-C", cwd, "-c", "commit.gpgSign=false", "-c", "tag.gpgSign=false", ...args],
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

const ORIGIN = "circuits clone's origin is the announced repo";

describe("verify, rooted in the pin and the expected network", () => {
  let c: Synthetic;
  beforeAll(async () => {
    c = await syntheticCeremony();
  });

  it("stops at a ceremony.json other than the pinned one", async () => {
    expect(await failures(options(c, { announcementSha256: "00".repeat(32) }))).toEqual([
      expect.objectContaining({ id: "ceremony.json matches the pinned SHA-256" }),
    ]);
  });

  it("stops at an announcement for another network than the expected one", async () => {
    expect(await failures(options(c, { network: "mainnet", local: false }))).toEqual([
      {
        id: "ceremony.json announces the expected network",
        status: "fail",
        detail: "local, expected mainnet",
      },
    ]);
  });

  it("stops when the mode does not match the network", async () => {
    expect(await failures(options(c, { local: false }))).toEqual([
      {
        id: "verification mode matches the announced network",
        status: "fail",
        detail: "a local ceremony needs --local",
      },
    ]);
  });

  it("names the ceremony, its network and its circuits source in the summary", async () => {
    const lines = (await runVerify(options(c))).render().split("\n");
    const { tag, commit } = c.announcement.circuits_source;
    expect(lines.at(-2)).toBe(
      `ceremony synthetic-local on local; circuits https://github.com/orbinum/circuits ${tag} @ ${commit}`,
    );
  });

  it("does not run snarkjs at all when the ptau cannot be staged", async () => {
    const failed = await failures(options(c));
    expect(failed).toContainEqual(
      expect.objectContaining({ id: "ptau is a regular file", status: "fail" }),
    );
    expect(failed).toContainEqual({
      id: "shield: final zkey verifies from r1cs + ptau",
      status: "fail",
      detail: "not run: prerequisite failed (ptau is a regular file)",
    });
  });

  it("exits 1 when the verification fails", async () => {
    const before = process.exitCode;
    try {
      await verifyCommand.run([
        "--dir",
        c.dir,
        "--announcement-sha256",
        "00".repeat(32),
        "--network",
        "local",
        "--local",
      ]);
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = before;
    }
  });

  it("refuses a pinned ceremony.json that is not in canonical form", async () => {
    const text = `${JSON.stringify(c.announcement)}\n`;
    const copy = await tamperedCopy(c.dir, (d) => writeFile(join(d, "ceremony.json"), text));
    const failed = await failures(options(c, { dir: copy, announcementSha256: sha256Utf8(text) }));
    expect(failed).toEqual([
      {
        id: "ceremony.json is a valid announcement",
        status: "fail",
        detail:
          "ceremony.json: not in canonical form (two-space JSON, schema key order, final newline)",
      },
    ]);
  });

  it("fails a history rewritten with a valid chain (a contribution dropped)", async () => {
    const copy = await tamperedCopy(c.dir, (d) =>
      rewriteHistory(d, (records) => records.filter((_, i) => i !== 1)),
    );
    const failed = await failures(options(c, { dir: copy }));
    expect(failed).toContainEqual({
      id: "every circuit has at least 2 contributions",
      status: "fail",
      detail: "shield: 1",
    });
  });
});

describe("verify with the verifier's own circuits clone", () => {
  let work: string;
  let log: string;
  let path: string | undefined;
  let repo: string;
  let commit: string;
  beforeAll(async () => {
    work = await mkdtemp(join(tmpdir(), "orbinum-verify-clone-"));
    const bin = join(work, "bin");
    log = join(work, "circom.log");
    await mkdir(bin);
    await writeFile(
      join(bin, "circom"),
      [
        "#!/bin/sh",
        `if [ "$1" = "--version" ]; then echo "circom compiler ${TOOLING.circom}"; exit 0; fi`,
        `echo "$@" >> '${log}'`,
        'for a in "$@"; do out="$a"; done',
        'touch "$out/shield.r1cs"',
      ].join("\n"),
    );
    await chmod(join(bin, "circom"), 0o755);
    path = process.env.PATH;
    process.env.PATH = `${bin}:${path}`;

    repo = join(work, "circuits");
    await mkdir(join(repo, "circuits"), { recursive: true });
    git(repo, "init", "-q");
    await writeFile(join(repo, "circuits", "shield.circom"), "pragma circom 2.2.3;\n");
    await writeFile(join(repo, "manifest.json"), JSON.stringify({ circuits: {} }));
    await writeFile(
      join(repo, "pnpm-lock.yaml"),
      "importers:\n  .:\n    dependencies:\n      circomlib:\n        specifier: 2.0.5\n        version: 2.0.5\n",
    );
    git(repo, "add", ".");
    git(repo, "commit", "-qm", "release");
    git(repo, "tag", "v1.0.0");
    commit = git(repo, "rev-parse", "HEAD");
    await mkdir(join(repo, "node_modules", "circomlib"), { recursive: true });
    await writeFile(join(repo, "node_modules", "circomlib", "package.json"), '{"version":"2.0.5"}');
  });
  afterAll(async () => {
    process.env.PATH = path;
    await rm(work, { recursive: true, force: true });
  });

  it("fails a clone of another repository than the announced one", async () => {
    const c = await syntheticCeremony({ release: { tag: "v1.0.0", commit } });
    git(repo, "remote", "add", "origin", "https://user:token@github.com/orbinum-labs/circuits.git");
    try {
      expect(await failures(options(c, { circuitsRepo: repo }))).toContainEqual({
        id: ORIGIN,
        status: "fail",
        detail: "origin is github.com/orbinum-labs/circuits",
      });
      git(repo, "remote", "set-url", "origin", "git@github.com:orbinum/circuits.git");
      const failed = (await failures(options(c, { circuitsRepo: repo }))).map((f) => f.id);
      expect(failed).not.toContain(ORIGIN);
    } finally {
      git(repo, "remote", "remove", "origin");
    }
  });

  it("rebuilds with the pinned circom flags, whatever init.json says", async () => {
    const c = await syntheticCeremony({
      release: { tag: "v1.0.0", commit },
      circomFlags: ["--r1cs", "--O2", "--json", "--c"],
    });
    await rm(log, { force: true });
    const failed = await failures(options(c, { circuitsRepo: repo }));
    expect(failed).toContainEqual(
      expect.objectContaining({
        id: "init.json pins the ptau and the tooling, and every circuit fits the ptau",
      }),
    );
    const calls = (await readFile(log, "utf8")).trim().split("\n");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(new RegExp(` ${TOOLING.circomFlags.join(" ")} -o `));
    expect(calls[0]).not.toMatch(/--json|--c\b|--O2/);
  });
});
