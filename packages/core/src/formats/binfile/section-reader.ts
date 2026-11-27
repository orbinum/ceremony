/** A `ByteReader` bounded to one section, so no read can leave it. */
import { ByteReader } from "./byte-reader";
import type { Section } from "./types";

export const sectionReader = (bytes: Uint8Array, s: Section): ByteReader =>
  new ByteReader(bytes, s.offset, s.offset + s.size);
