/** Bounds an upload is held to before any byte is read. SPEC §2.5, A9. */
import { BYTES_PER_CONTRIBUTION, MAX_FILE_BYTES } from "../../config";

/** Largest acceptable upload for contribution `index` (1-based) on a genesis of `genesisSize`. */
export const maxUploadSize = (genesisSize: number, index: number): number =>
  Math.min(MAX_FILE_BYTES, genesisSize + BYTES_PER_CONTRIBUTION * index);

/** Whether a claim was computed on another head than the current one. */
export const isStaleHead = (claim: { inputSha256: string }, head: { outputSha256: string }) =>
  claim.inputSha256 !== head.outputSha256;
