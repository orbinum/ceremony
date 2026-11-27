/**
 * An upload against its genesis: only δ, L and H may change, and only in their canonical form (no
 * limb raised by q, δ on the curve and not at infinity, the header δ equal to the new entry's).
 * Another key's δ passes this layout check, left to continuity or pairings. An out-of-range L or H
 * element is reported at the 64-byte G1 point holding it. Also the verify contract: snarkjs' answer
 * counts only with true and the success marker.
 */
import { describe, expect, it } from "vitest";
import { BN254_FQ } from "../../../src/formats/bn254";
import { sha256Hex } from "../../../src/primitives/hashing";
import { readMpcParams } from "../../../src/formats/mpc";
import {
  checkAgainstGenesis,
  genesisLayoutOf,
  precheckUpload,
  zkeyVerifyPassed,
  logLine,
} from "../../../src/verification";
import { bigToLe, editSection, leToBig, loadZkey, splitBinfile } from "../../support";

const genesis = loadZkey("0");
const LAYOUT = genesisLayoutOf(genesis);
const two = loadZkey("2");
const final = readMpcParams(loadZkey("final")).entries;
const head = {
  outputSha256: sha256Hex(loadZkey("1")),
  csHash: readMpcParams(genesis).csHash,
  previous: final
    .slice(0, 1)
    .map((e) => ({ hash: e.hash, name: e.name ?? "", deltaAfter: e.deltaAfter })),
};

function tampered(section: number, offset: number, value: number) {
  const bytes = editSection(two, section, (s) => {
    s[offset] = value;
    return s;
  });
  return {
    bytes,
    claim: {
      inputSha256: head.outputSha256,
      outputSha256: sha256Hex(bytes),
      contributionHash: final[1]?.hash as string,
    },
  };
}

describe("an upload against its genesis", () => {
  it("reads where δ sits in the genesis' Groth16 header", () => {
    expect([LAYOUT.deltaFrom, LAYOUT.deltaTo, LAYOUT.groth16.length]).toEqual([468, 660, 660]);
    expect([...LAYOUT.sizes.keys()]).toEqual([3, 4, 5, 6, 7, 8, 9]);
  });

  it("accepts every honest contribution and the final key", () => {
    for (const name of ["1", "2", "final"])
      expect(() => checkAgainstGenesis(loadZkey(name), LAYOUT)).not.toThrow();
  });

  it("refuses a header field snarkjs would size an allocation from (n8q), as malformed", () => {
    const { bytes, claim } = tampered(2, 3, 0xff);
    expect(precheckUpload(bytes, claim, head, LAYOUT)).toMatchObject({
      ok: false,
      reason: "malformed",
      detail: "Groth16 header differs from the genesis outside δ",
    });
  });

  it("refuses another protocol, and another α, β or γ", () => {
    const protocol = tampered(1, 0, 2);
    expect(precheckUpload(protocol.bytes, protocol.claim, head, LAYOUT)).toMatchObject({
      detail: "header section differs from the genesis",
    });
    const { bytes, claim } = tampered(2, 200, 1);
    expect(precheckUpload(bytes, claim, head, LAYOUT)).toMatchObject({ reason: "malformed" });
  });

  it("lets δ differ from the genesis, but not leave the curve", () => {
    const other = editSection(loadZkey("2"), 2, (s) => {
      s.set(
        sectionOf(loadZkey("1"), 2).subarray(LAYOUT.deltaFrom, LAYOUT.deltaTo),
        LAYOUT.deltaFrom,
      );
      return s;
    });
    expect(() => checkAgainstGenesis(other, LAYOUT)).not.toThrow();
    const { bytes } = tampered(2, LAYOUT.deltaFrom + 5, 7);
    expect(() => checkAgainstGenesis(bytes, LAYOUT)).toThrow(/not on the curve/);
  });

  it("refuses as a genesis a file whose Groth16 header is not laid out as snarkjs writes it", () => {
    const longer = editSection(genesis, 2, (s) => new Uint8Array([...s, 0]));
    expect(() => genesisLayoutOf(longer)).toThrow("genesis: unexpected Groth16 header layout");
  });

  it("refuses a section of another size than the genesis'", () => {
    const resized = editSection(two, 4, (s) => new Uint8Array([...s, 0, 0, 0, 0]));
    expect(() => checkAgainstGenesis(resized, LAYOUT)).toThrow(
      "section 4 size differs from the genesis",
    );
  });
});

function plusQ(section: number, offset: number) {
  const bytes = editSection(two, section, (s) => {
    const limb = s.subarray(offset, offset + 32);
    bigToLe(leToBig(limb) + BN254_FQ, limb);
    return s;
  });
  return {
    bytes,
    claim: {
      inputSha256: head.outputSha256,
      outputSha256: sha256Hex(bytes),
      contributionHash: final[1]?.hash as string,
    },
  };
}

const sectionOf = (bytes: Uint8Array, type: number) =>
  splitBinfile(bytes).sections.find((s) => s.type === type)?.data as Uint8Array;

describe("canonical δ, L and H (one spelling per key)", () => {
  const delta2 = LAYOUT.deltaFrom + 64;

  it.each([0, 1, 2, 3])("rejects δ2 limb %i raised by q as malformed", (i) => {
    const { bytes, claim } = plusQ(2, delta2 + 32 * i);
    expect(precheckUpload(bytes, claim, head, LAYOUT)).toMatchObject({
      ok: false,
      result: "rejected",
      reason: "malformed",
      detail: "field element out of range",
    });
  });

  it("rejects δ1 raised by q, and δ2 at infinity, as malformed", () => {
    const delta1 = plusQ(2, LAYOUT.deltaFrom);
    expect(precheckUpload(delta1.bytes, delta1.claim, head, LAYOUT)).toMatchObject({
      reason: "malformed",
      detail: "field element out of range",
    });
    const zeroed = editSection(two, 2, (s) => s.fill(0, delta2, LAYOUT.deltaTo));
    const claim = { ...delta1.claim, outputSha256: sha256Hex(zeroed) };
    expect(precheckUpload(zeroed, claim, head, LAYOUT)).toMatchObject({
      reason: "malformed",
      detail: "G2 point at infinity",
    });
  });

  it("rejects a header δ1 other than the new entry's δ", () => {
    const earlier = sectionOf(loadZkey("1"), 2).subarray(LAYOUT.deltaFrom, delta2);
    const bytes = editSection(two, 2, (s) => {
      s.set(earlier, LAYOUT.deltaFrom);
      return s;
    });
    const claim = {
      inputSha256: head.outputSha256,
      outputSha256: sha256Hex(bytes),
      contributionHash: final[1]?.hash as string,
    };
    expect(precheckUpload(bytes, claim, head, LAYOUT)).toMatchObject({
      reason: "malformed",
      detail: "Groth16 header δ differs from the new entry's δ",
    });
  });

  it.each([
    ["an L element (section 8)", 8, 0, /section 8 \(L\): field element out of range at 0/],
    ["an H element (section 9)", 9, 64 + 32, /section 9 \(H\): field element out of range at 64/],
  ])("rejects %s raised by q as malformed", (_, section, offset, detail) => {
    const { bytes, claim } = plusQ(section, offset);
    const r = precheckUpload(bytes, claim, head, LAYOUT);
    expect(r).toMatchObject({ ok: false, reason: "malformed" });
    expect(r.ok ? "" : r.detail).toMatch(detail);
  });

  it("returns the header δ1 of an honest upload, its new entry's δ", () => {
    expect(checkAgainstGenesis(two, LAYOUT)).toBe(final[1]?.deltaAfter);
  });
});

describe("the verify contract", () => {
  it("counts snarkjs' answer only with true and the success marker", () => {
    expect(zkeyVerifyPassed(true, `${logLine("info", "ZKey Ok!")}`)).toBe(true);
    expect(zkeyVerifyPassed(true, logLine("info", "done"))).toBe(false);
    expect(zkeyVerifyPassed(false, logLine("info", "ZKey Ok!"))).toBe(false);
  });
});
