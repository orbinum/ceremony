/**
 * The largest acceptable upload for contribution `index` (1-based) on a genesis of `genesisSize`,
 * held before any byte is read: the genesis plus a fixed allowance per contribution, never above
 * the file cap.
 */
import { BYTES_PER_CONTRIBUTION, MAX_FILE_BYTES } from "../../config";

export const maxUploadSize = (genesisSize: number, index: number): number =>
  Math.min(MAX_FILE_BYTES, genesisSize + BYTES_PER_CONTRIBUTION * index);
