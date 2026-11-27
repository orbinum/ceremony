/**
 * Malformed MPC sections and non-canonical zkey layouts are refused as `FormatError`, never a
 * crash; each case edits an honest fixture in place.
 */
import { describe, expect, it } from "vitest";
import { BN254_FQ } from "../../../src/formats/bn254";
import { checkZkeyStructure, readMpcParams, ZKEY_SECTION } from "../../../src/formats/mpc";
import { FormatError } from "../../../src/primitives/errors";
import {
  bigToLe,
  editSection,
  joinBinfile,
  leToBig,
  loadZkey,
  mpcEntryOffsets,
  splitBinfile,
} from "../../support";

const MPC = ZKEY_SECTION.mpcParams;

const editEntry = (
  edit: (s: Uint8Array, at: ReturnType<typeof mpcEntryOffsets>) => void,
  file = "1",
  entry = 0,
) =>
  editSection(loadZkey(file), MPC, (s) => {
    edit(s, mpcEntryOffsets(s, entry));
    return s;
  });

const read = (zkey: Uint8Array) => () => readMpcParams(zkey);

describe("MPC section, hostile bytes", () => {
  it("reads the honest file it starts from", () => {
    expect(readMpcParams(loadZkey("1")).entries).toHaveLength(1);
  });

  it("refuses δ written as a non-canonical field element (same point, another spelling)", () => {
    const zkey = editEntry((s, at) => {
      const x = s.subarray(at.deltaAfter, at.deltaAfter + 32);
      bigToLe(leToBig(x) + BN254_FQ, x);
    });
    expect(read(zkey)).toThrow(/field element out of range/);
  });

  it("refuses δ at infinity", () => {
    const zkey = editEntry((s, at) => s.fill(0, at.deltaAfter, at.deltaAfter + 64));
    expect(read(zkey)).toThrow(/G1 point at infinity/);
  });

  it("refuses an unknown entry type", () => {
    const zkey = editEntry((s, at) =>
      new DataView(s.buffer, s.byteOffset).setUint32(at.type, 7, true),
    );
    expect(read(zkey)).toThrow(/unknown MPC entry type/);
  });

  it("refuses an unknown parameter tag", () => {
    const zkey = editEntry((s, at) => {
      s[at.params] = 9;
    });
    expect(read(zkey)).toThrow(/unknown MPC parameter 9/);
  });

  it("refuses parameters out of order (a beacon entry with its tags swapped)", () => {
    const zkey = editEntry(
      (s, at) => {
        const nameLength = s[at.params + 1] as number;
        s[at.params + 2 + nameLength] = 1;
      },
      "final",
      2,
    );
    expect(read(zkey)).toThrow(/not sorted/);
  });

  it("refuses a parameter length that disagrees with the parameters", () => {
    const shorter = editEntry((s, at) => {
      const v = new DataView(s.buffer, s.byteOffset);
      v.setUint32(at.paramsLength, v.getUint32(at.paramsLength, true) - 1, true);
    });
    expect(read(shorter)).toThrow(FormatError);
    const longer = editEntry((s, at) => {
      const v = new DataView(s.buffer, s.byteOffset);
      v.setUint32(at.paramsLength, v.getUint32(at.paramsLength, true) + 1, true);
    });
    expect(read(longer)).toThrow(/run past the section/);
  });

  it("refuses an empty or non-UTF-8 contributor name", () => {
    const empty = editEntry((s, at) => {
      s[at.params + 1] = 0;
    });
    expect(read(empty)).toThrow(/empty MPC entry name/);
    const binary = editEntry((s, at) => s.fill(0xff, at.params + 2, at.params + 4));
    expect(read(binary)).toThrow(/not UTF-8/);
  });

  it("refuses bytes after the last entry", () => {
    const padded = editSection(loadZkey("1"), MPC, (s) => Uint8Array.from([...s, 0]));
    expect(read(padded)).toThrow(/trailing bytes in MPC section/);
  });

  it("refuses an entry count the section cannot hold, before parsing any entry", () => {
    const bomb = editSection(loadZkey("1"), MPC, (s) => {
      new DataView(s.buffer, s.byteOffset).setUint32(64, 0xffffffff, true);
      return s;
    });
    expect(read(bomb)).toThrow(/declares 4294967295 entries, at most 1 allowed/);
  });

  it("refuses a duplicated MPC section", () => {
    const f = splitBinfile(loadZkey("1"));
    const mpc = f.sections.find((s) => s.type === MPC);
    const dup = joinBinfile(f.magic, f.version, [
      ...f.sections,
      mpc as (typeof f.sections)[number],
    ]);
    expect(read(dup)).toThrow(/expected one section 10, found 2/);
  });
});

describe("canonical upload layout", () => {
  it("refuses another binfile version", () => {
    const f = splitBinfile(loadZkey("1"));
    expect(() => checkZkeyStructure(joinBinfile(f.magic, 2, f.sections))).toThrow(/zkey version 2/);
  });

  it("refuses the same sections in another order (a malleable file hash)", () => {
    const f = splitBinfile(loadZkey("1"));
    const [a, b, ...rest] = f.sections;
    const swapped = joinBinfile(f.magic, f.version, [b, a, ...rest] as typeof f.sections);
    expect(readMpcParams(swapped).entries).toHaveLength(1);
    expect(() => checkZkeyStructure(swapped)).toThrow(/expected 1\.\.10 once each, in order/);
  });

  it("refuses a file with no sections", () => {
    expect(() => checkZkeyStructure(joinBinfile("zkey", 1, []))).toThrow(FormatError);
  });
});
