/** Atomic writes: a new temp file, flushed, renamed, directory flushed; never partial. */
import type { FileHandle } from "node:fs/promises";
import * as fsp from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ensureDir, writeAtomic, writeJson } from "../../../src/files";

vi.mock("node:fs/promises", async (actual) => {
  const real = await actual<typeof import("node:fs/promises")>();
  return {
    ...real,
    open: vi.fn<typeof real.open>(real.open),
    rename: vi.fn<typeof real.rename>(real.rename),
  };
});

const { mkdir, mkdtemp, readdir, readFile, rm, stat } = fsp;
const real = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "orbinum-write-test-"));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe("atomic writes", () => {
  it("writes the content and leaves no temp file behind", async () => {
    const out = join(dir, "out", "transcript.json");
    await writeAtomic(out, "one");
    await writeAtomic(out, "two");
    expect(await readFile(out, "utf8")).toBe("two");
    expect(await readdir(join(dir, "out"))).toEqual(["transcript.json"]);
  });

  it("flushes the file before the rename, then the directory", async () => {
    const events: string[] = [];
    vi.mocked(fsp.open).mockImplementation(async (...args: Parameters<typeof real.open>) => {
      const handle: FileHandle = await real.open(...args);
      const sync = handle.sync.bind(handle);
      handle.sync = async () => {
        events.push(`sync ${String(args[0]).endsWith(".tmp") ? "file" : "dir"}`);
        await sync();
      };
      return handle;
    });
    vi.mocked(fsp.rename).mockImplementation(async (...args) => {
      events.push("rename");
      await real.rename(...args);
    });
    try {
      await writeAtomic(join(dir, "flushed"), "data");
      expect(events).toEqual(["sync file", "rename", "sync dir"]);
    } finally {
      vi.mocked(fsp.open).mockImplementation(real.open);
      vi.mocked(fsp.rename).mockImplementation(real.rename);
    }
  });

  it("creates its temp file exclusively, never through a planted path", async () => {
    const flags: unknown[] = [];
    vi.mocked(fsp.open).mockImplementationOnce(async (...args: Parameters<typeof real.open>) => {
      flags.push(args[1]);
      return real.open(...args);
    });
    await writeAtomic(join(dir, "exclusive"), "data");
    expect(flags).toEqual(["wx"]);
  });

  it("leaves the previous content when the write fails, and no temp file", async () => {
    const target = join(dir, "kept");
    await writeAtomic(target, "previous");
    vi.mocked(fsp.open).mockImplementationOnce(async (...args: Parameters<typeof real.open>) => {
      const handle: FileHandle = await real.open(...args);
      handle.writeFile = () => Promise.reject(new Error("ENOSPC: no space left on device"));
      return handle;
    });
    await expect(writeAtomic(target, "next")).rejects.toThrow("ENOSPC");
    expect(await readFile(target, "utf8")).toBe("previous");
    expect(await readdir(dir)).not.toContainEqual(expect.stringMatching(/\.tmp$/));
  });

  it("removes its temp file when the rename fails, leaving the target as it was", async () => {
    const target = join(dir, "fail", "taken");
    await mkdir(join(target, "child"), { recursive: true });
    await expect(writeAtomic(target, "data")).rejects.toThrow(/EISDIR|ENOTEMPTY|EEXIST|EPERM/);
    expect(await readdir(join(dir, "fail"))).toEqual(["taken"]);
    expect((await stat(target)).isDirectory()).toBe(true);
  });

  it("writes indented JSON with a final newline, and creates directories", async () => {
    await ensureDir(join(dir, "a", "b"));
    await writeJson(join(dir, "a", "b", "x.json"), { k: 1 });
    expect(await readFile(join(dir, "a", "b", "x.json"), "utf8")).toBe('{\n  "k": 1\n}\n');
  });
});
