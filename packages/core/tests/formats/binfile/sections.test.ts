/** The iden3 container: bounded section table, sections inside the file. SPEC §2.5. */
import { describe, expect, it } from "vitest";
import { MAX_SECTIONS } from "../../../src/config";
import { readBinfile, readSections } from "../../../src/formats/binfile";
import { loadZkey } from "../../support";

/** A container header followed by `count` empty sections of one type. */
function sectionBomb(count: number): Uint8Array {
  const bytes = new Uint8Array(12 + count * 12);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode("zkey"));
  view.setUint32(4, 1, true);
  view.setUint32(8, count, true);
  for (let i = 0; i < count; i++) view.setUint32(12 + i * 12, 99, true);
  return bytes;
}

describe("readSections", () => {
  it("reads a real zkey's section table", () => {
    const sections = readSections(loadZkey("final"), "zkey");
    expect([...sections.keys()].toSorted((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("refuses a header declaring 2^32 − 1 sections before reading any of them", () => {
    const header = new Uint8Array(12);
    header.set(new TextEncoder().encode("zkey"));
    new DataView(header.buffer).setUint32(4, 1, true);
    new DataView(header.buffer).setUint32(8, 0xffffffff, true);
    expect(() => readSections(header, "zkey")).toThrow(/4294967295 sections, at most 32/);
  });

  it("accepts up to the section cap", () => {
    expect(readSections(sectionBomb(MAX_SECTIONS), "zkey").get(99)).toHaveLength(MAX_SECTIONS);
    expect(() => readSections(sectionBomb(MAX_SECTIONS + 1), "zkey")).toThrow(/sections/);
  });

  it("reports the version, the sections in file order, and a bad magic as hex", () => {
    const f = readBinfile(loadZkey("0"), "zkey");
    expect(f.version).toBe(1);
    expect(f.order.map((x) => x.type)).toEqual([1, 2, 4, 3, 9, 8, 5, 6, 7, 10]);
    expect(() => readBinfile(loadZkey("0"), "r1cs")).toThrow(
      'bad magic 0x7a6b6579, expected "r1cs"',
    );
  });

  it("refuses a section size beyond 2^53 or beyond the file", () => {
    const f = new Uint8Array(24);
    f.set(new TextEncoder().encode("zkey"));
    const v = new DataView(f.buffer);
    v.setUint32(8, 1, true);
    v.setBigUint64(16, 2n ** 60n, true);
    expect(() => readSections(f, "zkey")).toThrow(/u64 too large/);
    v.setBigUint64(16, 1n, true);
    expect(() => readSections(f, "zkey")).toThrow(/read past end/);
  });
});
