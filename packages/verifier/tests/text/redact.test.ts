/** Text that may leave the host (SPEC §7): private paths and terminal control bytes removed. */
import { realpathSync } from "node:fs";
import { mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { errorMessage, redact } from "../../src/text";

describe("redact", () => {
  it("removes home, temp and extra paths, and terminal control bytes", () => {
    const text = `${homedir()}/x ${tmpdir()}/y /Volumes/Data/c/z \u001b[2Kdone`;
    expect(redact(text, [["/Volumes/Data/c", "<dir>"]])).toBe("~/x $TMPDIR/y <dir>/z ?[2Kdone");
    expect(errorMessage(new Error("\u001b]0;title\u0007"))).toBe("?]0;title?");
  });

  it("replaces a path only up to a component boundary: never a prefix of a longer name", () => {
    const extra = [["/data/root", "<r>"]] as const;
    expect(redact("/data/rootfs/a /data/root.bak /data/root-1", extra)).toBe(
      "/data/rootfs/a /data/root.bak /data/root-1",
    );
    // Text before the path does not shield it (an escape sequence, a URL scheme, a prefix).
    expect(redact("\u001b[1A/data/root/a /srv/data/root/a", extra)).toBe("?[1A<r>/a /srv<r>/a");
    expect(redact("at /data/root/a, '/data/root' (/data/root)", extra)).toBe(
      "at <r>/a, '<r>' (<r>)",
    );
    expect(redact("file:///data/root/a", extra)).toBe("file://<r>/a");
    expect(redact("/data/root/a", [["/data/root/", "<r>"]])).toBe("<r>/a");
  });

  it("applies extra paths first, then the temp dir, then home", () => {
    const inHome = join(homedir(), "ceremony");
    expect(redact(`${inHome}/x ${homedir()}/y`, [[inHome, "<dir>"]])).toBe("<dir>/x ~/y");
    expect(redact(`${tmpdir()}/a`, [[tmpdir(), "<stage>"]])).toBe("<stage>/a");
  });

  it("also matches an extra path under its realpath spelling", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orbinum-redact-"));
    try {
      const real = await realpath(dir);
      const link = join(dir, "link");
      await symlink(real, link);
      expect(redact(`${real}/x and ${link}/y`, [[link, "<dir>"]])).toBe("<dir>/x and <dir>/y");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("also matches an extra path under home in its `~` spelling (text redacted once already)", () => {
    const inHome = join(homedir(), "work", "ceremony");
    const once = redact(`${inHome}/build/x.zkey`);
    expect(redact(once, [[inHome, "."]])).toBe("./build/x.zkey");
    expect(redact(`${inHome}/a and ~/work/ceremony/b`, [[inHome, "."]])).toBe("./a and ./b");
  });

  it("matches the temp dir under its realpath spelling too (/private/var on macOS)", () => {
    expect(redact(`${realpathSync(tmpdir())}/x and ${tmpdir()}/y`)).toBe("$TMPDIR/x and $TMPDIR/y");
  });

  it("keeps labels literal", () => {
    expect(redact("/data/x/a", [["/data/x", "$&$1"]])).toBe("$&$1/a");
  });
});
