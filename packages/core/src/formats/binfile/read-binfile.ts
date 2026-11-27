/**
 * Parses the iden3 binfile container shared by `.zkey`, `.r1cs` and `.ptau`: 4-byte magic, u32
 * version, u32 section count, then (u32 type, u64 size, data) per section. The section count is
 * capped before the table is read, so a crafted header costs O(1); every section must lie inside
 * the file, read one after another.
 */
import { MAX_SECTIONS } from "../../config";
import { toHex, utf8 } from "../../primitives/encoding";
import { FormatError } from "../../primitives/errors";
import { ByteReader } from "./byte-reader";
import type { Binfile, Section, SectionTable } from "./types";

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
