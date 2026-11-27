/**
 * The iden3 binfile's shapes: where one section's data lies in the file, sections by type (each
 * list in file order), and a parsed container (its version, sections in file order and by type).
 */
export interface Section {
  type: number;
  offset: number;
  size: number;
}

export type SectionTable = Map<number, Section[]>;

export interface Binfile {
  version: number;
  order: Section[];
  sections: SectionTable;
}
