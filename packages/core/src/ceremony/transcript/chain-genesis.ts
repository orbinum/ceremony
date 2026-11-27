/**
 * chain_0 of a ceremony's hash chain, rooted in the announcement:
 * chain_0 = SHA-256( UTF-8(ceremony_id) ‖ SHA-256(JCS(announcement)) ), over raw digest bytes.
 */
import { utf8 } from "../../primitives/encoding";
import { canonicalJson, createSha256, sha256Bytes } from "../../primitives/hashing";

export const chainGenesis = (ceremonyId: string, announcement: unknown): string =>
  createSha256()
    .update(utf8(ceremonyId))
    .update(sha256Bytes(utf8(canonicalJson(announcement))))
    .digestHex();
