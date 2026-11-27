/**
 * The layout every upload must share with its genesis (a pinned, trusted zkey): the protocol
 * section, the Groth16 header and the sizes of sections 3–9 (IC, coefficients, A, B1, B2, L, H).
 * The header holds n8q, q, n8r, r, nVars, nPublic, domainSize, then α1, β1 (G1), β2, γ2 (G2), and
 * ends with δ1 (G1, 2 Fq) and δ2 (G2, 4 Fq); any other layout, including a header too short for
 * its own sizes, is refused with the same error.
 */
import { readSections, uniqueSection } from "../../formats/binfile";
import { ZKEY_SECTION } from "../../formats/mpc";
import { FormatError } from "../../primitives/errors";
import { sectionBytes } from "./section-bytes";
import type { GenesisLayout } from "./types";

const FIXED_SIZE_SECTIONS = [3, 4, 5, 6, 7, 8, 9] as const;

export function genesisLayoutOf(genesis: Uint8Array): GenesisLayout {
  const sections = readSections(genesis, "zkey");
  const groth16 = sectionBytes(genesis, sections, ZKEY_SECTION.groth16Header);
  const view = new DataView(groth16.buffer, groth16.byteOffset, groth16.byteLength);
  let n8q: number;
  let n8r: number;
  try {
    n8q = view.getUint32(0, true);
    n8r = view.getUint32(4 + n8q, true);
  } catch {
    throw new FormatError("genesis: unexpected Groth16 header layout");
  }
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
