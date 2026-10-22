/**
 * An upload against the genesis it extends (SPEC §2.5, §7): a contribution changes only δ in the
 * Groth16 header and the contents of the L and H sections, so every other header byte and every
 * section size must be the genesis'. snarkjs sizes its allocations from these fields before any
 * bounds check, so a crafted one could otherwise exhaust the verifier. What may change must be
 * canonical: δ a valid point in its only spelling, every L and H element below q.
 */
import { readSections, type SectionTable, uniqueSection } from "../../formats/binfile";
import { checkCanonicalFq, g1LemToUncompressed, g2LemToUncompressed } from "../../formats/bn254";
import { ZKEY_SECTION } from "../../formats/mpc";
import { toHex } from "../../primitives/encoding";
import { FormatError } from "../../primitives/errors";

/** What every upload must share with its genesis. */
export interface GenesisLayout {
  /** Section 1 (the protocol id). */
  header: Uint8Array;
  /** Section 2, the Groth16 header; only `[deltaFrom, deltaTo)` (δ in G1 and G2) may differ. */
  groth16: Uint8Array;
  deltaFrom: number;
  deltaTo: number;
  /** Sizes of sections 3–9 (IC, coefficients, A, B1, B2, L, H). */
  sizes: ReadonlyMap<number, number>;
}

const FIXED_SIZE_SECTIONS = [3, 4, 5, 6, 7, 8, 9] as const;

const sectionBytes = (bytes: Uint8Array, sections: SectionTable, type: number) => {
  const s = uniqueSection(sections, type);
  return bytes.subarray(s.offset, s.offset + s.size);
};

/** The layout of a genesis zkey (a pinned, trusted file). */
export function genesisLayoutOf(genesis: Uint8Array): GenesisLayout {
  const sections = readSections(genesis, "zkey");
  const groth16 = sectionBytes(genesis, sections, ZKEY_SECTION.groth16Header);
  const view = new DataView(groth16.buffer, groth16.byteOffset, groth16.byteLength);
  const n8q = view.getUint32(0, true);
  const n8r = view.getUint32(4 + n8q, true);
  // n8q, q, n8r, r, nVars, nPublic, domainSize, then α1, β1 (G1), β2, γ2 (G2), δ1 (G1), δ2 (G2).
  const deltaFrom = 4 + n8q + 4 + n8r + 12 + 2 * (2 * n8q) + 2 * (4 * n8q);
  const deltaTo = deltaFrom + 2 * n8q + 4 * n8q;
  if (deltaTo !== groth16.length) {
    throw new FormatError("genesis: unexpected Groth16 header layout");
  }
  const sizes = new Map(FIXED_SIZE_SECTIONS.map((t) => [t, uniqueSection(sections, t).size]));
  return {
    header: sectionBytes(genesis, sections, ZKEY_SECTION.header),
    groth16,
    deltaFrom,
    deltaTo,
    sizes,
  };
}

const equal = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Throws `FormatError` unless `zkey` (already structure-checked) has the genesis' protocol, the
 * genesis' Groth16 header but for δ, the genesis' section sizes, a canonical δ (G1 and G2, no
 * limb ≥ q, not infinity) and canonical L and H. Returns δ·G1 of the header, uncompressed
 * big-endian hex, for the caller to hold against the new MPC entry.
 */
export function checkAgainstGenesis(zkey: Uint8Array, genesis: GenesisLayout): string {
  const sections = readSections(zkey, "zkey");
  if (!equal(sectionBytes(zkey, sections, ZKEY_SECTION.header), genesis.header)) {
    throw new FormatError("header section differs from the genesis");
  }
  const groth16 = sectionBytes(zkey, sections, ZKEY_SECTION.groth16Header);
  const { deltaFrom, deltaTo } = genesis;
  if (
    groth16.length !== genesis.groth16.length ||
    !equal(groth16.subarray(0, deltaFrom), genesis.groth16.subarray(0, deltaFrom)) ||
    !equal(groth16.subarray(deltaTo), genesis.groth16.subarray(deltaTo))
  ) {
    throw new FormatError("Groth16 header differs from the genesis outside δ");
  }
  for (const [type, size] of genesis.sizes) {
    if (uniqueSection(sections, type).size !== size) {
      throw new FormatError(`section ${type} size differs from the genesis`);
    }
  }
  // snarkjs' pairing tolerates a limb ≥ q, but `contribute` and `beacon` do not: one accepted
  // spelling would break every key built on it.
  const deltaSplit = deltaFrom + (deltaTo - deltaFrom) / 3; // δ1 is 2 Fq, δ2 4 Fq
  const delta1 = g1LemToUncompressed(groth16.subarray(deltaFrom, deltaSplit));
  g2LemToUncompressed(groth16.subarray(deltaSplit, deltaTo));
  checkCanonicalFq(sectionBytes(zkey, sections, ZKEY_SECTION.l), "section 8 (L)");
  checkCanonicalFq(sectionBytes(zkey, sections, ZKEY_SECTION.h), "section 9 (H)");
  return toHex(delta1);
}
