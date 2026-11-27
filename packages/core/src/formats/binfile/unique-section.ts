/** The single section of `type`: absent or repeated is a `FormatError`. */
import { FormatError } from "../../primitives/errors";
import type { Section, SectionTable } from "./types";

export function uniqueSection(sections: SectionTable, type: number): Section {
  const found = sections.get(type) ?? [];
  if (found.length !== 1) {
    throw new FormatError(`expected one section ${type}, found ${found.length}`);
  }
  return found[0] as Section;
}
