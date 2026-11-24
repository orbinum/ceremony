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
  "--circuit-ids",
  "shield=3,unshield=2,transfer=1",
];

/** `base` with other `--circuit-ids`. */
const withIds = (ids: string) => [...base.slice(0, -2), "--circuit-ids", ids];

describe("parseInitOptions", () => {
  it("resolves paths and defaults the output directory", () => {
    expect(parseInitOptions(base)).toEqual({
      ceremonyId: "test-1",
      circuitsRepo: resolve("../circuits"),
      circuitsRef: "v0.16.0",
      circuits: [
        { name: "shield", circuitId: 3 },
        { name: "unshield", circuitId: 2 },
        { name: "transfer", circuitId: 1 },
      ],
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

  it("takes any circuits of the release, each with its on-chain id, once", () => {
    expect(parseInitOptions(withIds(" private_sweep=7 ")).circuits).toEqual([
      { name: "private_sweep", circuitId: 7 },
    ]);
    for (const [ids, message] of [
      ["shield", /not <name>=<on-chain id>/],
      ["shield=0", /not <name>=<on-chain id>/],
      ["shield=3=4", /not <name>=<on-chain id>/],
      ["shield=4294967296", /not <name>=<on-chain id>/],
      ["Shield=3", /not a circuit name/],
      ["constructor=3", /not a circuit name/],
      ["../x=3", /not a circuit name/],
      ["shield=3,shield=4", /appears twice/],
      ["shield=3,unshield=3", /share an id/],
      [Array.from({ length: 17 }, (_, i) => `c${i}=${i + 1}`).join(","), /at most 16/],
    ] as const) {
      expect(() => parseInitOptions(withIds(ids))).toThrow(message);
    }
  });

  it("rejects unknown flags", () => {
    expect(() => parseInitOptions([...base, "--nope"])).toThrow(/Unknown option/);
  });
});
