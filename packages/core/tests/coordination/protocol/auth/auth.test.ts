/**
 * Coordinator ↔ verifier request authentication: the MAC binds the ceremony, the timestamp, the
 * method, the path and the body, unambiguously.
 */
import { describe, expect, it } from "vitest";
import {
  authHeadersWellFormed,
  checkHmacKey,
  bodyMatches,
  requestAuthOf,
  signRequest,
  verifyRequest,
  verifyRequestHeaders,
} from "../../../../src/coordination/protocol";
import { utf8 } from "../../../../src/primitives/encoding";
import { signToken, timingSafeEqual, verifyToken } from "../../../../src/primitives/hashing";

const KEY = "a-shared-key-of-at-least-32-bytes";
const CID = "unit-test-1";
const NOW = 1_800_000_000_000;

describe("request authentication (coordinator ↔ verifier)", () => {
  const signed = signRequest(KEY, CID, "POST", "/verify", "{}", NOW);
  const headers = requestAuthOf((n) => signed[n]);

  it("accepts the exact request within ±60 s", () => {
    expect(verifyRequest(KEY, CID, "POST", "/verify", "{}", headers, NOW + 60_000)).toBe(true);
  });

  it("refuses another key, method, path, body, or a stale timestamp", () => {
    expect(verifyRequest(`${KEY}-other`, CID, "POST", "/verify", "{}", headers, NOW)).toBe(false);
    expect(verifyRequest(KEY, CID, "GET", "/verify", "{}", headers, NOW)).toBe(false);
    expect(verifyRequest(KEY, CID, "POST", "/verifY", "{}", headers, NOW)).toBe(false);
    expect(verifyRequest(KEY, CID, "POST", "/verify", "{ }", headers, NOW)).toBe(false);
    expect(verifyRequest(KEY, CID, "POST", "/verify", "{}", headers, NOW + 60_001)).toBe(false);
    expect(
      verifyRequest(KEY, CID, "POST", "/verify", "{}", { ...headers, timestamp: "1e12" }, NOW),
    ).toBe(false);
  });
});

describe("request authentication refuses what could be ambiguous", () => {
  it("refuses a key shorter than 32 bytes on both sides", () => {
    expect(() => signRequest("short", CID, "POST", "/verify", "{}", NOW)).toThrow(
      /at least 32 bytes/,
    );
    expect(() =>
      verifyRequest(
        "",
        CID,
        "POST",
        "/verify",
        "{}",
        { timestamp: "1", signature: "a", bodySha256: "a" },
        NOW,
      ),
    ).toThrow(/at least 32 bytes/);
  });

  it("refuses missing headers, a future timestamp and a newline in method or path", () => {
    const signed = signRequest(KEY, CID, "POST", "/verify", "{}", NOW);
    const headers = requestAuthOf((n) => signed[n]);
    expect(
      verifyRequest(KEY, CID, "POST", "/verify", "{}", { ...headers, signature: undefined }, NOW),
    ).toBe(false);
    expect(
      verifyRequest(KEY, CID, "POST", "/verify", "{}", { ...headers, timestamp: null }, NOW),
    ).toBe(false);
    expect(verifyRequest(KEY, CID, "POST", "/verify", "{}", headers, NOW - 60_001)).toBe(false);
    expect(() => signRequest(KEY, CID, "POST", "/a\nb", "{}", NOW)).toThrow(/newline/);
    expect(verifyRequest(KEY, CID, "POST\n", "/verify", "{}", headers, NOW)).toBe(false);
  });
});

describe("request authentication binds what it signs", () => {
  const signed = signRequest(KEY, CID, "POST", "/verify", "{}", NOW);
  const headers = requestAuthOf((n) => signed[n]);

  it("refuses a request signed for another ceremony under the same key", () => {
    expect(verifyRequest(KEY, CID, "POST", "/verify", "{}", headers, NOW)).toBe(true);
    expect(verifyRequest(KEY, "unit-test-2", "POST", "/verify", "{}", headers, NOW)).toBe(false);
  });

  it("refuses a ceremony id that is not one (it would make the MAC input ambiguous)", () => {
    expect(() => signRequest(KEY, "a\nb", "POST", "/verify", "{}", NOW)).toThrow(/ceremony id/);
    expect(() => signRequest(KEY, "", "POST", "/verify", "{}", NOW)).toThrow(/ceremony id/);
    expect(verifyRequest(KEY, `${CID}\n`, "POST", "/verify", "{}", headers, NOW)).toBe(false);
  });

  it("refuses a request whose path absorbs part of the body", () => {
    const s = signRequest(KEY, CID, "POST", "/internal/a", "b\nc", NOW);
    const h = requestAuthOf((n) => s[n]);
    expect(verifyRequest(KEY, CID, "POST", "/internal/a", "b\nc", h, NOW)).toBe(true);
    expect(verifyRequest(KEY, CID, "POST", "/internal/a\nb", "c", h, NOW)).toBe(false);
    const m = signRequest(KEY, CID, "POST", "/internal/a", "\nx", NOW);
    const hm = requestAuthOf((n) => m[n]);
    expect(verifyRequest(KEY, CID, "POST\n/internal/a", "", "x", hm, NOW)).toBe(false);
  });

  it("refuses a MAC truncated to a prefix, or extended", () => {
    const sig = headers.signature as string;
    for (const signature of [sig.slice(0, 1), sig.slice(0, 63), `${sig}0`]) {
      expect(verifyRequest(KEY, CID, "POST", "/verify", "{}", { ...headers, signature }, NOW)).toBe(
        false,
      );
    }
    expect(timingSafeEqual("ab", "abc")).toBe(false);
    expect(timingSafeEqual("abc", "ab")).toBe(false);
    expect(timingSafeEqual("abc", "abc")).toBe(true);
  });

  it("refuses a token whose MAC is truncated to a prefix", () => {
    const token = signToken("session", { gid: 1 }, KEY, 60_000, NOW);
    const [body, mac] = token.split(".") as [string, string];
    expect(verifyToken("session", token, KEY, NOW)).toMatchObject({ gid: 1 });
    expect(verifyToken("session", `${body}.${mac.slice(0, 1)}`, KEY, NOW)).toBeNull();
    expect(verifyToken("session", `${body}.`, KEY, NOW)).toBeNull();
  });

  it("checks the header shapes before any body is read", () => {
    const sig = headers.signature as string;
    const shape = (timestamp: string | null | undefined, signature: string | null | undefined) =>
      authHeadersWellFormed({ ...headers, timestamp, signature });
    expect(shape(headers.timestamp, sig)).toBe(true);
    for (const [ts, s] of [
      [undefined, sig],
      [null, sig],
      ["", sig],
      ["1e12", sig],
      ["1".repeat(17), sig],
      [headers.timestamp, undefined],
      [headers.timestamp, sig.toUpperCase()],
      [headers.timestamp, sig.slice(0, 63)],
      [headers.timestamp, `${sig}0`],
    ] as const) {
      expect(shape(ts, s)).toBe(false);
    }
    for (const bodySha256 of [undefined, "", "AB".repeat(32), "ab".repeat(31)]) {
      expect(authHeadersWellFormed({ ...headers, bodySha256 })).toBe(false);
    }
    expect(shape("1".repeat(16), sig)).toBe(true);
    const upper = { ...headers, signature: sig.toUpperCase() };
    expect(verifyRequest(KEY, CID, "POST", "/verify", "{}", upper, NOW)).toBe(false);
  });

  it("accepts only keys of at least 32 bytes", () => {
    expect(() => checkHmacKey(KEY)).not.toThrow();
    expect(() => checkHmacKey("x".repeat(31))).toThrow(/at least 32 bytes/);
    expect(() => checkHmacKey("é".repeat(16))).not.toThrow();
  });
});

describe("authentication before the body", () => {
  const signed = signRequest(KEY, CID, "POST", "/internal/verifications", '{"a":1}', NOW);
  const headers = requestAuthOf((n) => signed[n]);

  it("checks the MAC from the headers alone, then holds the body to the signed digest", () => {
    const path = "/internal/verifications";
    expect(verifyRequestHeaders(KEY, CID, "POST", path, headers, NOW)).toBe(true);
    expect(bodyMatches(utf8('{"a":1}'), headers)).toBe(true);
    expect(bodyMatches(utf8('{"a":2}'), headers)).toBe(false);
    expect(bodyMatches(new Uint8Array(), headers)).toBe(false);
  });

  it("refuses a digest the MAC does not cover, so a forged body cannot ride a real MAC", () => {
    const other = requestAuthOf(
      (n) => signRequest(KEY, CID, "POST", "/internal/verifications", "{}", NOW)[n],
    );
    const swapped = { ...headers, bodySha256: other.bodySha256 };
    expect(verifyRequestHeaders(KEY, CID, "POST", "/internal/verifications", swapped, NOW)).toBe(
      false,
    );
  });
});
