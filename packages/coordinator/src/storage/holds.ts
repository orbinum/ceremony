/** Whether an object holds exactly the bytes of a SHA-256, by the checksum R2 stored for it. */
import { toHex } from "@orbinum-ceremony/core";

export const holds = (object: R2Object | null, sha256: string): boolean =>
  !!object?.checksums.sha256 && toHex(object.checksums.sha256) === sha256;
