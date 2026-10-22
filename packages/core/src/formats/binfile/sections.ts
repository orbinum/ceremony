/**
 * The iden3 binfile container shared by `.zkey`, `.r1cs` and `.ptau`: 4-byte magic, u32 version,
 * u32 section count, then (u32 type, u64 size, data) per section. SPEC §2.5.
 */
import { MAX_SECTIONS } from "../../config";
import { FormatError } from "../../primitives/errors";
import { toHex, utf8 } from "../../primitives/encoding";
import { ByteReader } from "./reader";

/** Where one section's data lies in the file. */
export interface Section {
  type: number;
  offset: number;
  size: number;
}

/** Sections by type, each list in file order. */
export type SectionTable = Map<number, Section[]>;

/** A parsed container: its version, the sections in file order, and by type. */
interface Binfile {
  version: number;
  order: Section[];
  sections: SectionTable;
}

/**
 * Parses the container. The section count is capped before the table is read, so a crafted
 * header costs O(1); every section must lie inside the file, read one after another.
 */
export function readBinfile(bytes: Uint8Array, magic: string): Binfile {
  const r = new ByteReader(bytes);
  const found = r.bytesOf(4);
  const expected = utf8(magic);
  if (!found.every((b, i) => b === expected[i])) {
    throw new FormatError(`bad magic 0x${toHex(found)}, expected "${magic}"`);
  }
  const version = r.u32();
  const count = r.u32();
  if (count > MAX_SECTIONS) throw new FormatError(`${count} sections, at most ${MAX_SECTIONS}`);

  const order: Section[] = [];
  const sections: SectionTable = new Map();
  for (let i = 0; i < count; i++) {
    const type = r.u32();
    const size = r.u64();
    const section = { type, offset: r.pos, size };
    r.bytesOf(size);
    order.push(section);
    const list = sections.get(type);
    if (list) list.push(section);
    else sections.set(type, [section]);
  }
  return { version, order, sections };
}

/** The section table only. */
export const readSections = (bytes: Uint8Array, magic: string): SectionTable =>
  readBinfile(bytes, magic).sections;

/** The single section of `type`: absent or repeated is a `FormatError`. */
export function uniqueSection(sections: SectionTable, type: number): Section {
  const found = sections.get(type) ?? [];
  if (found.length !== 1) {
    throw new FormatError(`expected one section ${type}, found ${found.length}`);
  }
  return found[0] as Section;
}

/** A reader bounded to one section. */
export const sectionReader = (bytes: Uint8Array, s: Section): ByteReader =>
  new ByteReader(bytes, s.offset, s.offset + s.size);
