/** The entry point: exit codes (0 help, 2 usage, 1 failure) and terminal-safe errors. */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const TSX = join(import.meta.dirname, "..", "..", "..", "node_modules", ".bin", "tsx");
const ENTRY = join(import.meta.dirname, "..", "src", "main.ts");
const cli = (...args: string[]) => {
  const r = spawnSync(TSX, [ENTRY, ...args], { encoding: "utf8", timeout: 60_000 });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

describe("the entry point", { timeout: 60_000 }, () => {
  it("lists the commands on --help and exits 0", () => {
    const r = cli("--help");
    expect(r.code).toBe(0);
    expect(r.err).toMatch(/publish-final/);
  });

  it("refuses an unknown command terminal-safely with exit 2", () => {
    const r = cli("\u001b[2Kfoo");
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/^unknown command: \?\[2Kfoo/);
  });

  it("prints the command's usage on a usage error, exit 2", () => {
    const r = cli("verify", "--dir", "d");
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/^error: missing --network\n\norbinum-ceremony verify/);
  });

  it("prints any other failure as one line, exit 1", () => {
    const r = cli(
      "publish-final",
      "--dir",
      "/nonexistent-dir",
      "--coordinator",
      "http://127.0.0.1:9",
    );
    expect(r.code).toBe(1);
    expect(r.err.trim().split("\n")).toHaveLength(1);
    expect(r.err).toMatch(/^error: /);
  });
});
