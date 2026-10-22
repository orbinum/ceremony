/**
 * Canonical upload layout: an upload is the output of `zkey contribute`, so it must be exactly
 * that file — version 1, sections 1..10 once each in that order, nothing after the last. snarkjs
 * reads sections by type and ignores padding, so any other layout would make the file hash
 * malleable without changing what is verified. SPEC §2.5 #3.
 */
import { FormatError } from "../../primitives/errors";
import { readBinfile } from "../binfile";
import { ZKEY_SECTION_ORDER, ZKEY_VERSION } from "./zkey";

/** Throws `FormatError` unless `zkey` has the exact layout `zkey contribute` writes. */
export function checkZkeyStructure(zkey: Uint8Array): void {
  const { version, order } = readBinfile(zkey, "zkey");
  if (version !== ZKEY_VERSION)
    throw new FormatError(`zkey version ${version}, expected ${ZKEY_VERSION}`);
  const types = order.map((s) => s.type);
  for (const t of types) {
    if (!(ZKEY_SECTION_ORDER as readonly number[]).includes(t)) {
      throw new FormatError(`unknown section ${t}`);
    }
  }
  if (types.join(",") !== ZKEY_SECTION_ORDER.join(",")) {
    throw new FormatError(`sections ${types.join(",")}, expected 1..10 once each, in order`);
  }
  const last = order.at(-1);
  const end = last ? last.offset + last.size : 0;
  if (end !== zkey.byteLength) {
    throw new FormatError(`${zkey.byteLength - end} bytes after the last section`);
  }
}
