// core/formats/binfile: the iden3 container (zkey, r1cs, ptau).
export { ByteReader } from "./reader";
export {
  readBinfile,
  readSections,
  type Section,
  sectionReader,
  type SectionTable,
  uniqueSection,
} from "./sections";
