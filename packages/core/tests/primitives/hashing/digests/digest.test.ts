/** The ceremony's hash functions match their known vectors, and streaming equals one-shot. */
import { describe, expect, it } from "vitest";
import {
  blake2b256Hex,
  blake2b512Hex,
  createBlake2b512,
  createSha256,
  sha256Hex,
} from "../../../../src/primitives/hashing";

const abc = new TextEncoder().encode("abc");

describe("digests", () => {
  it("sha256 matches the FIPS 180-2 vector", () => {
    expect(sha256Hex(abc)).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("blake2b-512 matches the RFC 7693 vector", () => {
    expect(blake2b512Hex(abc)).toBe(
      "ba80a53f981c4d0d6a2797b69f12f6e94c212f14685ac4b74b12bb6fdbffa2d17d87c5392aab792dc252d5de4533cc9518d38aa8dbf1925ab92386edd4009923",
    );
  });

  it("blake2b-256 matches the reference vector", () => {
    expect(blake2b256Hex(abc)).toBe(
      "bddd813c634239723171ef3fee98579b94964e3bb1cb3e427262c8c068d52319",
    );
  });

  it("streaming equals one-shot", () => {
    const parts = [abc.subarray(0, 1), abc.subarray(1)];
    const sha = createSha256();
    const b2 = createBlake2b512();
    for (const p of parts) {
      sha.update(p);
      b2.update(p);
    }
    expect(sha.digestHex()).toBe(sha256Hex(abc));
    expect(b2.digestHex()).toBe(blake2b512Hex(abc));
  });
});
