/** Text patterns and basic validators for data from outside. */
import { describe, expect, it } from "vitest";
import { FormatError } from "../../../src/primitives/errors";
import {
  asCommit,
  asHex,
  asIsoTime,
  asRecord,
  asSafeInt,
  asString,
  normalizeHex,
} from "../../../src/primitives/schema";

describe("schema primitives", () => {
  it("accepts canonical hex only; normalizes client hex", () => {
    expect(asHex("ab".repeat(32), "h", 32)).toBe("ab".repeat(32));
    expect(() => asHex("AB".repeat(32), "h", 32)).toThrow(FormatError);
    expect(() => asHex("ab".repeat(31), "h", 32)).toThrow(/32-byte/);
    expect(normalizeHex("AB".repeat(32), "h", 32)).toBe("ab".repeat(32));
  });

  it("rejects values JCS cannot serialize or that lose precision", () => {
    expect(() => asSafeInt(Number.NaN, "n", 0, 10)).toThrow(FormatError);
    expect(() => asSafeInt(JSON.parse("1e400"), "n", 0, Number.MAX_SAFE_INTEGER)).toThrow(
      FormatError,
    );
    expect(() => asSafeInt(2 ** 53, "n", 0, 2 ** 60)).toThrow(FormatError);
    expect(() => asString(JSON.parse('"\\ud800"'), "s", 10)).toThrow(/Unicode/);
    expect(asString("😀", "s", 10)).toBe("😀");
  });

  it("requires exactly the declared fields", () => {
    expect(() => asRecord({ a: 1 }, "r", ["a", "b"])).toThrow(/missing field "b"/);
    expect(() => asRecord({ a: 1, b: 2, c: 3 }, "r", ["a", "b"])).toThrow(/unexpected field "c"/);
    expect(() => asRecord(JSON.parse('{"a":1,"__proto__":{}}'), "r", ["a"])).toThrow(
      /unexpected field "__proto__"/,
    );
  });

  it("accepts only full commit ids, never revisions", () => {
    expect(asCommit("a".repeat(40), "c")).toBe("a".repeat(40));
    for (const rev of ["HEAD", "v0.16.0", "--output=x", ":/msg", "A".repeat(40)]) {
      expect(() => asCommit(rev, "c")).toThrow(FormatError);
    }
  });

  it("accepts only canonical ISO timestamps", () => {
    expect(asIsoTime("2026-10-06T00:00:00.000Z", "t")).toBe("2026-10-06T00:00:00.000Z");
    expect(() => asIsoTime("2026-10-06", "t")).toThrow(FormatError);
    expect(() => asIsoTime("yesterday", "t")).toThrow(FormatError);
  });
});
