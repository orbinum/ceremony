/** The section table of an iden3 binfile, without its version or file order. */
import { readBinfile } from "./read-binfile";
import type { SectionTable } from "./types";

export const readSections = (bytes: Uint8Array, magic: string): SectionTable =>
  readBinfile(bytes, magic).sections;
