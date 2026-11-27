/** The data of the one section of `type` in a parsed zkey, shared by the genesis layout checks. */
import { type SectionTable, uniqueSection } from "../../formats/binfile";

export const sectionBytes = (bytes: Uint8Array, sections: SectionTable, type: number) => {
  const s = uniqueSection(sections, type);
  return bytes.subarray(s.offset, s.offset + s.size);
};
