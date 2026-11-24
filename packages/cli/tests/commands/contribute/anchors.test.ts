/** A head against the published transcript: the same contributions, hash and name, in order. */
import { describe, expect, it } from "vitest";
import { headMismatch } from "../../../src/commands/contribute/anchors";

const entry = (i: number) => ({ hash: String(i).repeat(128).slice(0, 128), name: String(i) });
const chain = (n: number) => Array.from({ length: n }, (_, i) => entry(i + 1));

describe("headMismatch", () => {
  it("accepts a head that is exactly the recorded chain, genesis included", () => {
    expect(headMismatch([], [])).toBeNull();
    expect(headMismatch(chain(3), chain(3))).toBeNull();
  });

  it("refuses a fork: a different h_k or a rewritten name at the same position", () => {
    const hash = [entry(1), { ...entry(2), hash: "f".repeat(128) }, entry(3)];
    expect(headMismatch(hash, chain(3))).toBe("forks from the published transcript at #2");
    const name = [entry(1), { hash: entry(2).hash }];
    expect(headMismatch(name, chain(2))).toBe("forks from the published transcript at #2");
    // A fork that is also longer or shorter is still named a fork.
    expect(headMismatch([{ ...entry(1), hash: "0".repeat(128) }], chain(2))).toMatch(/forks .* #1/);
  });

  it("refuses a stale head and one the transcript does not reach", () => {
    expect(headMismatch(chain(1), chain(3))).toBe(
      "is stale: 1 contributions, the published transcript records 3",
    );
    expect(headMismatch(chain(3), chain(2))).toBe(
      "has 3 contributions, the published transcript records only 2",
    );
  });
});
