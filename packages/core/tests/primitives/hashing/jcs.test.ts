/** RFC 8785 canonical JSON, the only serialization hashed or signed. SPEC §3.3. */
import { describe, expect, it } from "vitest";
import { FormatError } from "../../../src/primitives/errors";
import { canonicalJson } from "../../../src/primitives/hashing";

describe("canonicalJson", () => {
  it("sorts keys and drops insignificant whitespace", () => {
    expect(canonicalJson({ b: 1, a: [1, "x"], c: { z: true, y: null } })).toBe(
      '{"a":[1,"x"],"b":1,"c":{"y":null,"z":true}}',
    );
  });

  it("is independent of key insertion order", () => {
    expect(canonicalJson({ x: 1, y: 2 })).toBe(canonicalJson({ y: 2, x: 1 }));
  });

  it("rejects values without a JSON representation", () => {
    expect(() => canonicalJson(undefined)).toThrow(FormatError);
  });
});

describe("canonicalJson on hostile values", () => {
  it.each([
    ["NaN", { n: Number.NaN }],
    ["Infinity from 1e400", JSON.parse('{"n":1e400}')],
    ["a lone surrogate", JSON.parse('{"s":"\\ud800"}')],
  ])("rejects %s with a FormatError", (_, value) => {
    expect(() => canonicalJson(value)).toThrow(FormatError);
  });
});
