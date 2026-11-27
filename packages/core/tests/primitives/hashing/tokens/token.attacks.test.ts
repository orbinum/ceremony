/**
 * Attacks on signed tokens (session cookie, OAuth state): forged, truncated, re-encoded and
 * oddly-typed input never yields a payload; a correctly MAC'd body (built as the key holder
 * would) is still read strictly.
 */
import { describe, expect, it } from "vitest";
import { toBase64url, utf8 } from "../../../../src/primitives/encoding";
import {
  hmacSha256Hex,
  keyBytes,
  signToken,
  verifyToken,
} from "../../../../src/primitives/hashing";

const KEY = "test-session-key-of-32-bytes-or-more";
const SCOPE = "session:local";
const NOW = 1_800_000_000_000;

const withBody = (body: string, scope = SCOPE, key = KEY) =>
  `${body}.${hmacSha256Hex(keyBytes(key, "k"), `${scope}.${body}`)}`;
const b64 = (v: unknown) => toBase64url(utf8(typeof v === "string" ? v : JSON.stringify(v)));

describe("forged and mangled tokens", () => {
  const valid = signToken(SCOPE, { gid: 1, login: "a" }, KEY, 60_000, NOW);
  const [body, mac] = valid.split(".") as [string, string];

  it("accepts the genuine token", () => {
    expect(verifyToken(SCOPE, valid, KEY, NOW)).toMatchObject({ gid: 1, login: "a" });
  });

  it("refuses an empty, truncated, extended, upper-cased or re-split MAC", () => {
    for (const t of [
      `${body}.`,
      `${body}.${mac.slice(0, 63)}`,
      `${body}.${mac.slice(0, 32)}`,
      `${body}.${mac}0`,
      `${body}.${mac.toUpperCase()}`,
      `${body}.${mac}.`,
      `${body}..${mac}`,
      `.${mac}`,
      `${body}`,
      "",
      ".",
      ` ${valid}`,
      `${valid} `,
    ]) {
      expect(verifyToken(SCOPE, t, KEY, NOW)).toBeNull();
    }
    expect(verifyToken(SCOPE, undefined, KEY, NOW)).toBeNull();
  });

  it("refuses a body re-encoded without the key (padding, standard alphabet, trailing bits)", () => {
    const std = `${body.replaceAll("-", "+").replaceAll("_", "/")}+`;
    for (const b of [`${body}=`, `${body}==`, std, `${body}A`, body.toLowerCase()]) {
      expect(b).not.toBe(body);
      expect(verifyToken(SCOPE, `${b}.${mac}`, KEY, NOW)).toBeNull();
    }
  });

  it("refuses a token of another scope, ceremony or key", () => {
    expect(verifyToken("oauth-state:local", valid, KEY, NOW)).toBeNull();
    expect(verifyToken("session:mainnet", valid, KEY, NOW)).toBeNull();
    expect(verifyToken(SCOPE, valid, `${KEY}!`, NOW)).toBeNull();
  });

  it("refuses at and after exp, accepts 1 ms before", () => {
    expect(verifyToken(SCOPE, valid, KEY, NOW + 60_000)).toBeNull();
    expect(verifyToken(SCOPE, valid, KEY, NOW + 60_000 - 1)).not.toBeNull();
  });
});

describe("a correctly MAC'd body is still read strictly", () => {
  it("refuses exp that is missing, not a number, or in the past", () => {
    for (const payload of [
      { gid: 1 },
      { gid: 1, exp: String(NOW + 1e9) },
      { gid: 1, exp: null },
      { gid: 1, exp: true },
      { gid: 1, exp: [NOW + 1e9] },
      { gid: 1, exp: NOW },
      { gid: 1, exp: -1 },
    ]) {
      expect(verifyToken(SCOPE, withBody(b64(payload)), KEY, NOW)).toBeNull();
    }
  });

  it("refuses a body that is not a JSON object, or not JSON, or not UTF-8", () => {
    for (const body of [
      b64([1, 2]),
      b64("5"),
      b64("null"),
      b64('"x"'),
      b64("{"),
      toBase64url(new Uint8Array([0xff, 0xfe, 0x7b, 0x7d])),
      "!!!",
    ]) {
      expect(verifyToken(SCOPE, withBody(body), KEY, NOW)).toBeNull();
    }
  });

  it("accepts any future exp, since only the key holder can mint one", () => {
    const eternal = withBody(b64({ gid: 1, login: "a", exp: Number.MAX_VALUE }));
    expect(verifyToken(SCOPE, eternal, KEY, NOW)).not.toBeNull();
  });

  it("reads a duplicated exp as JSON.parse does: the last one wins", () => {
    const dup = withBody(b64(`{"gid":1,"exp":1,"exp":${NOW + 1000}}`));
    expect(verifyToken(SCOPE, dup, KEY, NOW)).toMatchObject({ gid: 1 });
  });

  it("throws a configuration error under a key shorter than 32 bytes", () => {
    expect(() => verifyToken(SCOPE, "a.b", "short", NOW)).toThrow(/must be at least 32 bytes/);
  });
});
