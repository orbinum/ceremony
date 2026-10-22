/** The canonical upload layout: exactly what `zkey contribute` writes. SPEC §2.5 #3. */
import { describe, expect, it } from "vitest";
import { FormatError } from "../../../src/primitives/errors";
import { checkZkeyStructure } from "../../../src/formats/mpc";
import { loadZkey } from "../../support";

/** Appends one extra section (type, payload) to a zkey and bumps the section count. */
function withExtraSection(zkey: Uint8Array, type: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(zkey.length + 12 + payload.length);
  out.set(zkey);
  const view = new DataView(out.buffer);
  view.setUint32(8, view.getUint32(8, true) + 1, true);
  view.setUint32(zkey.length, type, true);
  view.setBigUint64(zkey.length + 4, BigInt(payload.length), true);
  out.set(payload, zkey.length + 12);
  return out;
}

describe("checkZkeyStructure", () => {
  it("accepts every zkey `zkey contribute` and `zkey beacon` wrote", () => {
    for (const name of ["1", "2", "final", "beacon_only"]) {
      expect(() => checkZkeyStructure(loadZkey(name))).not.toThrow();
    }
  });

  it("refuses a genesis: `groth16 setup` writes another section order, never an upload's", () => {
    expect(() => checkZkeyStructure(loadZkey("0"))).toThrow(/expected 1\.\.10 once each, in order/);
  });

  it("rejects bytes appended after the last section (hash malleability)", () => {
    const padded = new Uint8Array([...loadZkey("2"), 0, 0, 0, 0]);
    expect(() => checkZkeyStructure(padded)).toThrow(/4 bytes after the last section/);
  });

  it("rejects an unknown extra section", () => {
    const extra = withExtraSection(loadZkey("2"), 11, new Uint8Array(8));
    expect(() => checkZkeyStructure(extra)).toThrow(/unknown section 11/);
  });

  it("rejects a duplicated section", () => {
    const dup = withExtraSection(loadZkey("2"), 3, new Uint8Array(8));
    expect(() => checkZkeyStructure(dup)).toThrow(FormatError);
  });
});
