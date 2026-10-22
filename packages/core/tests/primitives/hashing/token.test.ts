/** Signed, expiring tokens bound to their scope and key. */
import { describe, expect, it } from "vitest";
import { signToken, verifyToken } from "../../../src/primitives/hashing";
import { fromBase64url, toBase64url, utf8 } from "../../../src/primitives/encoding";
import { FormatError } from "../../../src/primitives/errors";

const KEY = "k".repeat(32);
const NOW = 1_000_000;

describe("signed tokens", () => {
  it("round-trips a payload within its lifetime and scope", () => {
    const t = signToken("session:a", { gid: 1 }, KEY, 1000, NOW);
    expect(verifyToken("session:a", t, KEY, NOW + 999)).toEqual({ gid: 1, exp: NOW + 1000 });
  });

  it("refuses another scope, another key, expiry, tampering and junk", () => {
    const t = signToken("session:a", { gid: 1 }, KEY, 1000, NOW);
    expect(verifyToken("session:b", t, KEY, NOW)).toBeNull();
    expect(verifyToken("session:a", t, "x".repeat(32), NOW)).toBeNull();
    expect(verifyToken("session:a", t, KEY, NOW + 1000)).toBeNull();
    const [body, mac] = t.split(".") as [string, string];
    const forged = toBase64url(utf8(JSON.stringify({ gid: 2, exp: NOW + 1000 })));
    expect(verifyToken("session:a", `${forged}.${mac}`, KEY, NOW)).toBeNull();
    expect(verifyToken("session:a", `${body}.${mac}.x`, KEY, NOW)).toBeNull();
    for (const junk of [undefined, "", ".", "a.b"]) {
      expect(verifyToken("session:a", junk, KEY, NOW)).toBeNull();
    }
  });

  it("refuses a payload that is not an object with a numeric expiry", () => {
    const body = toBase64url(utf8("[1]"));
    const t = signToken("s", {}, KEY, 1000, NOW);
    expect(verifyToken("s", `${body}.${t.split(".")[1]}`, KEY, NOW)).toBeNull();
  });

  it("refuses a key shorter than 32 bytes, whatever is signed", () => {
    expect(() => signToken("s", {}, "short", 1000, NOW)).toThrow(/at least 32 bytes/);
    expect(() => verifyToken("s", "a.b", "", NOW)).toThrow(/at least 32 bytes/);
  });
});

describe("base64url", () => {
  it("round-trips bytes without padding and refuses other alphabets", () => {
    const bytes = Uint8Array.from([251, 255, 0, 1]);
    expect(toBase64url(bytes)).toBe("-_8AAQ");
    expect(fromBase64url("-_8AAQ")).toEqual(bytes);
    expect(() => fromBase64url("+/8AAQ")).toThrow(FormatError);
    expect(() => fromBase64url("a b")).toThrow(FormatError);
  });
});
