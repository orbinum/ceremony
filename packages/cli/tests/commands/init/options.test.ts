/** `init` options. */
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseInitOptions } from "../../../src/commands/init";

const base = [
  "--ceremony-id",
  "test-1",
  "--circuits-repo",
  "../circuits",
  "--circuits-ref",
  "v0.16.0",
];

describe("parseInitOptions", () => {
  it("resolves paths and defaults the output directory", () => {
    expect(parseInitOptions(base)).toEqual({
      ceremonyId: "test-1",
      circuitsRepo: resolve("../circuits"),
      circuitsRef: "v0.16.0",
      out: resolve(join("artifacts", "test-1")),
      checkDeterminism: false,
      force: false,
    });
  });

  it("accepts a local ptau and the determinism check", () => {
    const opts = parseInitOptions([...base, "--ptau", "x.ptau", "--check-determinism"]);
    expect(opts).toMatchObject({ ptau: resolve("x.ptau"), checkDeterminism: true });
  });

  it("requires every mandatory flag", () => {
    expect(() => parseInitOptions(base.slice(2))).toThrow(/--ceremony-id/);
  });

  it("rejects ceremony ids that are not path-safe", () => {
    expect(() => parseInitOptions(["--ceremony-id", "../x", ...base.slice(2)])).toThrow(/a-z0-9/);
  });

  it("rejects unknown flags", () => {
    expect(() => parseInitOptions([...base, "--nope"])).toThrow(/Unknown option/);
  });
});
