/**
 * `genesis/init.json` from its published text: valid, and byte-for-byte the canonical
 * serialization of its value (no duplicate keys, nothing a reader sees but a tool ignores).
 */
import { parseCanonicalJson } from "../../../primitives/encoding";
import type { InitRecord } from "../types";
import { validateInit } from "./validate-init";

export const parseInit = (text: string): InitRecord =>
  parseCanonicalJson(text, "init.json", validateInit);
