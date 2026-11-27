/**
 * `ceremony.json` from its published text: valid, and byte-for-byte the canonical serialization
 * of its value, so the pinned bytes cannot carry duplicate keys or anything a reader sees but a
 * tool ignores.
 */
import { parseCanonicalJson } from "../../primitives/encoding";
import type { CeremonyAnnouncement } from "./types";
import { validateAnnouncement } from "./validate-announcement";

export const parseAnnouncement = (text: string): CeremonyAnnouncement =>
  parseCanonicalJson(text, "ceremony.json", validateAnnouncement);
