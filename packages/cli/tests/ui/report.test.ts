/** The verification report: statuses, counts, terminal safety and the summary. */
import { describe, expect, it } from "vitest";
import { Report } from "../../src/ui";

describe("the verification report", () => {
  it("fails a skipped security check outside local mode, and only skips it in local mode", () => {
    const full = new Report(false);
    full.skip("vk_hash", "needs --vk-packer", true);
    full.skip("rebuild", "pass --rebuild-genesis");
    expect(full.checks.map((c) => c.status)).toEqual(["fail", "skip"]);
    expect(full.ok).toBe(false);

    const local = new Report(true);
    local.skip("vk_hash", "needs --vk-packer", true);
    expect(local.checks[0]?.status).toBe("skip");
    expect(local.ok).toBe(true);
  });

  it("strips terminal controls and private paths from details", async () => {
    const r = new Report(false, [["/Volumes/Data/ceremony", "<dir>"]]);
    r.fail("a", "\u001b[2K\u001b[1A/Volumes/Data/ceremony/final");
    await r.attempt("b", () => Promise.reject(new Error("\u001b]0;pwned\u0007")));
    expect(r.checks.map((c) => c.detail)).toEqual(["?[2K?[1A<dir>/final", "?]0;pwned?"]);
    expect(r.render().includes("\u001b")).toBe(false);
  });

  it("reports whether each check passed, and counts them", async () => {
    const r = new Report(false);
    expect(r.expect("x", [])).toBe(true);
    expect(r.expect("y", ["bad"])).toBe(false);
    expect(await r.attempt("z", async () => [])).toBe(true);
    expect(r.render().split("\n").at(-1)).toBe("2 passed, 1 failed, 0 skipped");
  });

  it("names what was verified next to the counts, terminal-safe", () => {
    const r = new Report(false);
    r.pass("x");
    r.describe("ceremony c on mainnet; circuits \u001b[2Khttps://x v1 @ abc");
    expect(r.render().split("\n").slice(-2)).toEqual([
      "ceremony c on mainnet; circuits ?[2Khttps://x v1 @ abc",
      "1 passed, 0 failed, 0 skipped",
    ]);
  });
});
