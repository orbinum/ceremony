/** A killed run's private directories are swept at the next start (COORDINATOR §5). */
import { mkdir, mkdtemp, readdir, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sweepStaleTmp } from "../../../src/service";

describe("sweepStaleTmp", () => {
  it("removes only this service's long-abandoned directories, never through a link", async () => {
    const root = await mkdtemp(join(tmpdir(), "sweep-test-"));
    const old = new Date(Date.now() - 7 * 60 * 60_000);
    const outside = await mkdtemp(join(tmpdir(), "sweep-target-"));
    await writeFile(join(outside, "keep"), "x");
    for (const name of [
      "orbinum-verifier-old",
      "orbinum-upload-old",
      "orbinum-verifier-inputs-old",
      "orbinum-verify-old", // the CLI's, not ours
      "other-old",
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- a few fixtures
      await mkdir(join(root, name));
      // oxlint-disable-next-line no-await-in-loop -- a few fixtures
      await utimes(join(root, name), old, old);
    }
    await mkdir(join(root, "orbinum-upload-fresh"));
    await symlink(outside, join(root, "orbinum-verifier-link"));
    expect(await sweepStaleTmp(root)).toBe(3);
    expect((await readdir(root)).toSorted()).toEqual([
      "orbinum-upload-fresh",
      "orbinum-verifier-link",
      "orbinum-verify-old",
      "other-old",
    ]);
    expect(await readdir(outside)).toEqual(["keep"]);
  });
});
