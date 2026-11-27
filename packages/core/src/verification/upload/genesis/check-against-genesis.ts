/**
 * An upload against the genesis it extends. A contribution changes only δ in the Groth16 header and
 * the contents of the L and H sections, so every other header byte and every section size must be
 * the genesis': snarkjs sizes its allocations from these fields before any bounds check, so a
 * crafted one could otherwise exhaust the verifier. What may change must be canonical (δ a valid
 * point in its only spelling, not infinity, every L and H element below q): snarkjs' pairing
 * tolerates a limb ≥ q and judges points only by pairings, while `contribute`, `beacon` and the
 * independent verifier read them strictly, so one accepted spelling or off-curve point would break
 * every key built on it. Throws `FormatError`, else returns the header's δ·G1 (uncompressed
 * big-endian hex) for the caller to hold against the new MPC entry.
 */
import { readSections, uniqueSection } from "../../../formats/binfile";
import {
  checkG1Points,
  checkG2Subgroup,
  g1LemToUncompressed,
  g2LemToUncompressed,
} from "../../../formats/bn254";
import { ZKEY_SECTION } from "../../../formats/mpc";
import { toHex } from "../../../primitives/encoding";
import { FormatError } from "../../../primitives/errors";
import { sectionBytes } from "./section-bytes";
import type { GenesisLayout } from "../types";

const equal = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

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
  const deltaSplit = deltaFrom + (deltaTo - deltaFrom) / 3;
  const delta1 = g1LemToUncompressed(groth16.subarray(deltaFrom, deltaSplit));
  g2LemToUncompressed(groth16.subarray(deltaSplit, deltaTo));
  checkG2Subgroup(groth16.subarray(deltaSplit, deltaTo));
  checkG1Points(sectionBytes(zkey, sections, ZKEY_SECTION.l), "section 8 (L)");
  checkG1Points(sectionBytes(zkey, sections, ZKEY_SECTION.h), "section 9 (H)");
  return toHex(delta1);
}
