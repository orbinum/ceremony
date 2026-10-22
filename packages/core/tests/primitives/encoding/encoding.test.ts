/** Hex, base64url, strict UTF-8 and JSON text read from outside. */
import { describe, expect, it } from "vitest";
import {
  fromHex,
  fromUtf8,
  hex0x,
  normalizeSignature,
  parseJsonText,
  stripControl,
  toHex,
  utf8,
} from "../../../src/primitives/encoding";
import { FormatError } from "../../../src/primitives/errors";

describe("encoding", () => {
  it("round-trips hex in lowercase, from bytes or an ArrayBuffer", () => {
    const bytes = Uint8Array.from([0, 1, 171, 255]);
    expect(toHex(bytes)).toBe("0001abff");
    expect(toHex(bytes.buffer)).toBe("0001abff");
    expect(fromHex("0001ABFF")).toEqual(bytes);
    expect(hex0x("ab")).toBe("0xab");
  });

  it("refuses odd-length or non-hex input", () => {
    expect(() => fromHex("abc")).toThrow(/hex/i);
    expect(() => fromHex("zz")).toThrow(/hex/i);
  });

  it("stores signatures in one form: lowercase, no 0x", () => {
    expect(normalizeSignature("0xABcd")).toBe("abcd");
    expect(normalizeSignature("0XAB")).toBe("ab");
    expect(normalizeSignature("abcd")).toBe("abcd");
  });

  it("decodes UTF-8 strictly", () => {
    expect(fromUtf8(utf8("ñ€😀"))).toBe("ñ€😀");
    expect(() => fromUtf8(Uint8Array.from([0xff, 0xfe]))).toThrow(TypeError);
    expect(() => fromUtf8(Uint8Array.from([0xed, 0xa0, 0x80]))).toThrow(TypeError); // a lone surrogate
  });

  it("keeps a byte-order mark, so a pinned document with one is not canonical", () => {
    const bom = Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8("{}")]);
    expect(fromUtf8(bom)).toBe("\uFEFF{}");
  });
});

describe("text from outside", () => {
  it("parses JSON without echoing the input in the error", () => {
    expect(parseJsonText('{"a":1}', "x.json")).toEqual({ a: 1 });
    const hostile = "\u001b[2K\u001b[1A✓ all passed {";
    expect(() => parseJsonText(hostile, "ceremony.json")).toThrow(FormatError);
    expect(() => parseJsonText(hostile, "ceremony.json")).toThrow(
      /^ceremony\.json: not valid JSON$/,
    );
  });

  it("strips terminal controls and bidi overrides, keeping tab, newline and other Unicode", () => {
    expect(stripControl("δ ≠ γ…\tok\n")).toBe("δ ≠ γ…\tok\n");
    expect(stripControl("\u001b[31mred\u0007\r\u007f\u009b")).toBe("?[31mred????");
    expect(stripControl("a\u202eb\u2066c")).toBe("a?b?c");
  });
});
