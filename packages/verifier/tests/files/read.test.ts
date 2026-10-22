/** Reading files from outside (SPEC §7): one descriptor, regular files, exactly the opened size. */
import type { FileHandle } from "node:fs/promises";
import * as fsp from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSha256, sha256Hex, utf8 } from "@orbinum-ceremony/core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertRegularFile, hashFile, readBytes, readJsonFile } from "../../src/files";
import { within } from "../support";

vi.mock("node:fs/promises", async (actual) => {
  const real = await actual<typeof import("node:fs/promises")>();
  return { ...real, open: vi.fn<typeof real.open>(real.open) };
});

const { mkdtemp, rm, symlink, writeFile } = fsp;
const realOpen = (await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises"))
  .open;

/** The next open reports `size` instead of the file's real size, as if it changed after fstat. */
function nextOpenReports(size: number) {
  vi.mocked(fsp.open).mockImplementationOnce(async (...args: Parameters<typeof realOpen>) => {
    const handle: FileHandle = await realOpen(...args);
    const stat = handle.stat.bind(handle);
    handle.stat = (async () => Object.assign(await stat(), { size })) as typeof handle.stat;
    return handle;
  });
}

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "orbinum-read-test-"));
  await writeFile(join(dir, "plain"), "data");
  await symlink(join(dir, "plain"), join(dir, "link"));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe("reading files from outside", () => {
  it("reads and hashes a regular file", async () => {
    expect(await readBytes(join(dir, "plain"))).toEqual(utf8("data"));
    expect(await hashFile(join(dir, "plain"), createSha256())).toBe(sha256Hex(utf8("data")));
    expect(await assertRegularFile(join(dir, "plain"))).toBe(4);
  });

  it("refuses a symlink, even to a regular file", async () => {
    for (const read of [readBytes, (p: string) => hashFile(p, createSha256()), assertRegularFile]) {
      // oxlint-disable-next-line no-await-in-loop -- one reader at a time
      await expect(read(join(dir, "link"))).rejects.toThrow(/ELOOP|symbolic link/);
    }
  });

  it("refuses a file above the cap and a directory", async () => {
    await expect(readBytes(join(dir, "plain"), 3)).rejects.toThrow("plain: larger than 3 bytes");
    await expect(hashFile(dir, createSha256())).rejects.toThrow(/not a regular file/);
  });

  it("hashes an empty file", async () => {
    await writeFile(join(dir, "empty"), "");
    expect(await hashFile(join(dir, "empty"), createSha256())).toBe(sha256Hex(new Uint8Array()));
  });

  it("reads and hashes exactly the size the file had when opened", async () => {
    nextOpenReports(2);
    expect(await readBytes(join(dir, "plain"))).toEqual(utf8("da"));
    nextOpenReports(2);
    expect(await hashFile(join(dir, "plain"), createSha256())).toBe(sha256Hex(utf8("da")));
  });

  it("refuses a file that shrank while being read", async () => {
    nextOpenReports(10);
    await expect(within(5_000, "readBytes", readBytes(join(dir, "plain")))).rejects.toThrow(
      "plain: changed while being read",
    );
    nextOpenReports(10);
    await expect(
      within(5_000, "hashFile", hashFile(join(dir, "plain"), createSha256())),
    ).rejects.toThrow("plain: changed while being read");
  });
});

describe("JSON files from outside", () => {
  it("returns the value and the exact bytes", async () => {
    await writeFile(join(dir, "ok.json"), '{"a":1}');
    expect(await readJsonFile(join(dir, "ok.json"), 100)).toEqual({
      value: { a: 1 },
      bytes: utf8('{"a":1}'),
    });
  });

  it("names the file and never echoes its content", async () => {
    await writeFile(join(dir, "bad.json"), "secret-token{");
    await writeFile(join(dir, "latin1.json"), new Uint8Array([0x22, 0xe9, 0x22]));
    const error = await readJsonFile(join(dir, "bad.json"), 100).catch((e: Error) => e);
    expect((error as Error).message).toMatch(/^bad\.json/);
    expect((error as Error).message).not.toContain("secret-token");
    await expect(readJsonFile(join(dir, "latin1.json"), 100)).rejects.toThrow(
      "latin1.json: not valid UTF-8",
    );
    await expect(readJsonFile(join(dir, "ok.json"), 3)).rejects.toThrow(/larger than 3 bytes/);
  });
});
