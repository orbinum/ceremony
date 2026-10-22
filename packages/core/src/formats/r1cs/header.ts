/** Section 1 of a Circom `.r1cs` (iden3 `r1csfile` layout): the circuit's shape. SPEC §2.1. */
import { FormatError } from "../../primitives/errors";
import { toHex } from "../../primitives/encoding";
import { readSections, sectionReader, uniqueSection } from "../binfile";

/** The r1cs header fields. */
export interface R1csHeader {
  /** Scalar field modulus, big-endian hex. */
  prime: string;
  wires: number;
  publicOutputs: number;
  publicInputs: number;
  privateInputs: number;
  labels: number;
  constraints: number;
}

/** Reads the header section exactly (no bytes left over). Pure: takes the file bytes. */
export function readR1csHeader(r1cs: Uint8Array): R1csHeader {
  const r = sectionReader(r1cs, uniqueSection(readSections(r1cs, "r1cs"), 1));
  const n8 = r.u32();
  const header: R1csHeader = {
    prime: toHex(r.bytesOf(n8).toReversed()),
    wires: r.u32(),
    publicOutputs: r.u32(),
    publicInputs: r.u32(),
    privateInputs: r.u32(),
    labels: r.u64(),
    constraints: r.u32(),
  };
  if (r.pos !== r.end) throw new FormatError("trailing bytes in the r1cs header");
  return header;
}
