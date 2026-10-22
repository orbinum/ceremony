/** HMAC-SHA-256 and the constant-time comparison. */
import { describe, expect, it } from "vitest";
import { utf8 } from "../../../src/primitives/encoding";
import {
  hmacSha256Hex,
  keccak256,
  sha256Utf8,
  timingSafeEqual,
} from "../../../src/primitives/hashing";

describe("message authentication", () => {
  it("computes HMAC-SHA-256 (RFC 4231 test case 2)", () => {
    expect(hmacSha256Hex(utf8("Jefe"), "what do ya want for nothing?")).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );
  });

  it("compares in constant time and only equal strings are equal", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "ab")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });
});

describe("digests of text", () => {
  it("hashes UTF-8 bytes", () => {
    expect(sha256Utf8("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(Buffer.from(keccak256(utf8(""))).toString("hex")).toBe(
      "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
    );
  });
});
