/** Hashing types: an incremental hasher, so callers can stream large files (ptau, zkeys). */
export interface StreamingHasher {
  update(chunk: Uint8Array): StreamingHasher;
  digestHex(): string;
}
