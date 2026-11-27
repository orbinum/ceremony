/**
 * The r1cs header reads exactly (hostile bytes are refused), and its shape is checked against
 * the field, the ptau's domain and what init.json pins.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { editSection, joinBinfile, loadR1cs, splitBinfile } from "../../support";
import { FormatError } from "../../../src/primitives/errors";
import { BN254_FR } from "../../../src/formats/bn254";
import { checkR1csShape, domainPower, readR1csHeader } from "../../../src/formats/r1cs";

const r1cs = new Uint8Array(
  readFileSync(join(import.meta.dirname, "..", "..", "fixtures", "multiplier.r1cs")),
);

describe("readR1csHeader", () => {
  it("reads the multiplier circuit (c <== a * b)", () => {
    expect(readR1csHeader(r1cs)).toEqual({
      prime: BN254_FR,
      wires: 4,
      publicOutputs: 1,
      publicInputs: 0,
      privateInputs: 2,
      labels: 4,
      constraints: 1,
    });
  });

  it("rejects a zkey passed as r1cs", () => {
    const zkey = new Uint8Array(
      readFileSync(join(import.meta.dirname, "..", "..", "fixtures", "multiplier_0.zkey")),
    );
    expect(() => readR1csHeader(zkey)).toThrow(FormatError);
  });
});

describe("checkR1csShape", () => {
  const header = readR1csHeader(r1cs);

  it("computes the snarkjs domain", () => {
    expect(domainPower(header)).toBe(2);
  });

  it("reports every mismatch against the shape init.json pins", () => {
    expect(
      checkR1csShape(header, { constraints: 736, public_signals: 3, domain_power: 10 }),
    ).toEqual([
      "constraints 1, expected 736",
      "public signals 1, expected 3",
      "domain 2^2, expected 2^10",
    ]);
  });

  it("accepts a matching shape, and any shape the ptau covers before one is pinned", () => {
    const pinned = { constraints: 736, public_signals: 3, domain_power: 10 };
    expect(checkR1csShape({ ...header, constraints: 736, publicInputs: 2 }, pinned)).toEqual([]);
    expect(checkR1csShape({ ...header, constraints: 60_000, publicInputs: 9 })).toEqual([]);
  });

  it("rejects a non-BN254 field and a domain larger than the ptau", () => {
    const problems = checkR1csShape({
      ...header,
      prime: "00",
      constraints: 70_000,
      publicInputs: 2,
    });
    expect(problems).toContain("field 00 is not BN254 Fr");
    expect(problems).toContain("needs a 2^17 domain, ptau provides 2^16");
  });
});

const header = () => splitBinfile(loadR1cs());
const rebuild = (edit: (data: Uint8Array) => Uint8Array) => editSection(loadR1cs(), 1, edit);

describe("readR1csHeader, hostile bytes", () => {
  it("refuses a truncated file, a missing or duplicated header", () => {
    expect(() => readR1csHeader(loadR1cs().subarray(0, 40))).toThrow(FormatError);
    const f = header();
    const without = joinBinfile(
      f.magic,
      f.version,
      f.sections.filter((s) => s.type !== 1),
    );
    expect(() => readR1csHeader(without)).toThrow(/expected one section 1, found 0/);
    const twice = joinBinfile(f.magic, f.version, [
      ...f.sections,
      ...f.sections.filter((s) => s.type === 1),
    ]);
    expect(() => readR1csHeader(twice)).toThrow(/found 2/);
  });

  it("refuses bytes left over in the header and a label count beyond 2^53", () => {
    expect(() => readR1csHeader(rebuild((d) => Uint8Array.from([...d, 0])))).toThrow(
      /trailing bytes/,
    );
    const labels = rebuild((d) => {
      const n8 = new DataView(d.buffer).getUint32(0, true);
      new DataView(d.buffer).setBigUint64(4 + n8 + 16, 2n ** 60n, true);
      return d;
    });
    expect(() => readR1csHeader(labels)).toThrow(/u64 too large/);
  });
});
