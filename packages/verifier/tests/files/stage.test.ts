/**
 * Private copies of untrusted inputs: checked and copied from one descriptor, never followed out
 * of their root. A file named outside the root (an explicit --ptau) is the caller's choice.
 */
import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStage, type Stage, writeAtomic } from "../../src/files";
import { within } from "../support";

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "orbinum-stage-test-"));
  await writeFile(join(dir, "plain"), "data");
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe("staged copies", () => {
  let stage: Stage;
  beforeAll(async () => {
    stage = await createStage();
  });
  afterAll(() => stage.cleanup());

  it("copies a regular file to <dir>/<name>, read-only, byte for byte", async () => {
    const copy = await stage.copy(join(dir, "plain"), "plain");
    expect(copy).toBe(join(stage.dir, "plain"));
    expect(await readFile(copy, "utf8")).toBe("data");
    expect((await stat(copy)).mode & 0o777).toBe(0o400);
  });

  it("copies an empty file as an empty file", async () => {
    await writeFile(join(dir, "empty"), "");
    const copy = await stage.copy(join(dir, "empty"), "empty");
    expect((await readFile(copy)).length).toBe(0);
    expect((await stat(copy)).mode & 0o777).toBe(0o400);
  });

  it("refuses names that are not a single plain component", async () => {
    for (const name of ["", "a/b", ".hidden", "..", "../escape"]) {
      await expect(stage.copy(join(dir, "plain"), name)).rejects.toThrow(`bad stage name ${name}`);
    }
  });

  it("refuses a file above its bound, naming the copy", async () => {
    await expect(stage.copy(join(dir, "plain"), "small", 3)).rejects.toThrow(
      "small: larger than 3 bytes",
    );
  });

  it("refuses a symlink as the last component", async () => {
    await symlink(join(dir, "plain"), join(dir, "link"));
    await expect(stage.copy(join(dir, "link"), "link")).rejects.toThrow(/ELOOP|symbolic link/);
  });

  it("never overwrites an earlier copy", async () => {
    await stage.copy(join(dir, "plain"), "once");
    await expect(stage.copy(join(dir, "plain"), "once")).rejects.toThrow(/EEXIST/);
  });

  it("refuses a FIFO without blocking on it", async () => {
    const fifo = join(dir, "fifo");
    execFileSync("mkfifo", [fifo]);
    await expect(within(3_000, "copy of a FIFO", stage.copy(fifo, "fifo"))).rejects.toThrow(
      "fifo: not a regular file",
    );
  });

  it("removes everything on cleanup", async () => {
    const other = await createStage();
    await other.copy(join(dir, "plain"), "x");
    await other.cleanup();
    await expect(stat(other.dir)).rejects.toThrow(/ENOENT/);
  });
});

describe("staging under a root", () => {
  it("refuses a source whose parent directory is a symlink out of the root", async () => {
    const root = join(dir, "ceremony");
    const outside = join(dir, "outside");
    await writeAtomic(join(outside, "x.final.zkey"), "elsewhere");
    await writeAtomic(join(root, "genesis", "x.genesis.zkey"), "inside");
    await symlink(outside, join(root, "final"));
    const stage = await createStage("orbinum-stage-test-", root);
    try {
      const copy = await stage.copy(join(root, "genesis", "x.genesis.zkey"), "g");
      expect(await readFile(copy, "utf8")).toBe("inside");
      await expect(stage.copy(join(root, "final", "x.final.zkey"), "f")).rejects.toThrow(
        "f: a parent directory leaves the ceremony directory",
      );
      const explicit = await stage.copy(join(outside, "x.final.zkey"), "p");
      expect(await readFile(explicit, "utf8")).toBe("elsewhere");
    } finally {
      await stage.cleanup();
    }
  });

  it("compares against the root's realpath when the root itself is a symlink", async () => {
    const real = join(dir, "real-root");
    const root = join(dir, "root-link");
    await writeAtomic(join(real, "genesis", "x.zkey"), "inside");
    await symlink(real, root);
    const stage = await createStage("orbinum-stage-test-", root);
    try {
      const copy = await stage.copy(join(root, "genesis", "x.zkey"), "x");
      expect(await readFile(copy, "utf8")).toBe("inside");
    } finally {
      await stage.cleanup();
    }
  });

  it("fails, leaving nothing behind, when the root does not exist", async () => {
    await expect(createStage("orbinum-stage-missing-", join(dir, "nope"))).rejects.toThrow(
      /ENOENT/,
    );
    const left = (await readdir(tmpdir())).filter((f) => f.startsWith("orbinum-stage-missing-"));
    expect(left).toEqual([]);
  });
});
