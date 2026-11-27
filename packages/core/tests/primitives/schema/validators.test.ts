/** Field validators: exact shapes, bounds and the field path in every refusal. */
import { describe, expect, it } from "vitest";
import {
  asArray,
  asCeremonyId,
  asCount,
  asIsoTime,
  asNullable,
  asObject,
  asOneOf,
  asPositiveInt,
  asRecord,
  asSafeInt,
  asSchema,
  asString,
  asU32,
  TOKEN,
  toPrintable,
  ZKEY_NAME,
} from "../../../src/primitives/schema";

describe("field validators: every refusal names the field", () => {
  it("objects and records", () => {
    for (const v of [null, [], 1, "x"])
      expect(() => asObject(v, "a.b")).toThrow("a.b: expected an object");
    expect(() => asRecord({ x: 1, "evil\nkey": 2 }, "r", ["x"])).toThrow(
      'r: unexpected field "evil\\nkey"',
    );
    expect(() => asRecord({ x: 1, ["k".repeat(500)]: 2 }, "r", ["x"])).toThrow(
      /^r: unexpected field "k{65}$/,
    );
    expect(asRecord({ x: undefined }, "r", ["x"])).toEqual({ x: undefined });
  });

  it("arrays: type, maximum and minimum", () => {
    expect(() => asArray({}, "l", 2)).toThrow("l: expected an array");
    expect(() => asArray([1, 2, 3], "l", 2)).toThrow("l: more than 2 items");
    expect(() => asArray([], "l", 2, 1)).toThrow("l: fewer than 1 items");
    expect(asArray([1], "l", 2, 1)).toEqual([1]);
  });

  it("integers: safe, in range, never strings or floats", () => {
    for (const v of ["1", 1.5, -1, 2 ** 53, Number.NaN]) {
      expect(() => asSafeInt(v, "n", 0, 2 ** 53)).toThrow(/^n: expected an integer/);
    }
    expect(() => asU32(2 ** 32, "u")).toThrow(/u: expected an integer in \[1, 4294967295\]/);
    expect(() => asU32(0, "u")).toThrow(/u:/);
    expect(asU32(0, "u", 0)).toBe(0);
    expect(() => asPositiveInt(0, "p")).toThrow(/p:/);
    expect(asCount(0, "c")).toBe(0);
  });

  it("strings: type, length, well-formed Unicode, pattern", () => {
    expect(() => asString(1, "s", 5)).toThrow("s: expected a string");
    expect(() => asString("abcdef", "s", 5)).toThrow("s: longer than 5");
    expect(() => asString("a\udc00", "s", 5)).toThrow("s: invalid Unicode");
    expect(() => asString("a\ud800", "s", 5)).toThrow("s: invalid Unicode");
    expect(() => asString("a b", "s", 5, /^\S+$/)).toThrow(/s: does not match/);
  });

  it("ISO timestamps only in the exact form toISOString writes", () => {
    expect(asIsoTime("2026-10-08T12:00:00.000Z", "t")).toBe("2026-10-08T12:00:00.000Z");
    for (const v of [
      "2026-10-08T12:00:00Z",
      "2026-10-08T12:00:00.000+00:00",
      "2026-02-30T00:00:00.000Z",
      0,
    ]) {
      expect(() => asIsoTime(v, "t")).toThrow(/^t:/);
    }
  });

  it("enums, nullables, schema ids, ceremony ids", () => {
    expect(() => asOneOf("c", "e", ["a", "b"])).toThrow("e: expected one of a, b");
    expect(asNullable(null, () => 1)).toBeNull();
    expect(asNullable(2, (v) => v)).toBe(2);
    expect(() => asSchema("other/v1", "schema", "mine/v1")).toThrow(/schema:/);
    expect(asCeremonyId("testnet-rehearsal-0", "id")).toBe("testnet-rehearsal-0");
    for (const v of ["Upper", "a_b", "", "x".repeat(65), "../x"])
      expect(() => asCeremonyId(v, "id")).toThrow(/^id:/);
  });
});

describe("patterns", () => {
  it("tokens never start like a command-line option", () => {
    expect(TOKEN.test("v0.16.0")).toBe(true);
    expect(TOKEN.test("https://github.com/orbinum/circuits")).toBe(true);
    expect(TOKEN.test("--upload-pack=evil")).toBe(false);
    expect(TOKEN.test("a b")).toBe(false);
  });

  it("zkey names are 1–64 printable characters", () => {
    expect(ZKEY_NAME.test("alice")).toBe(true);
    expect(ZKEY_NAME.test("")).toBe(false);
    expect(ZKEY_NAME.test("x".repeat(65))).toBe(false);
    expect(ZKEY_NAME.test("a\nb")).toBe(false);
  });

  it("makes outside text printable and bounded", () => {
    expect(toPrintable("ok\n\u001b[31mred\u0000", 100)).toBe("ok??[31mred?");
    expect(toPrintable("abcdef", 3)).toBe("abc");
  });
});

describe("arrays from outside are dense", () => {
  it("refuses a hole (a caller-built sparse array), naming its index", () => {
    const sparse = [1, , 3]; // oxlint-disable-line no-sparse-arrays
    expect(() => asArray(sparse, "l", 5)).toThrow("l[1]: missing item");
  });
});
