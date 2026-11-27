/**
 * Hard bounds on everything read from outside, far above an honest ceremony. The largest file read
 * whole is the 75 MB ptau (zkeys reach ~17 MB). A final zkey holds one more MPC entry than its
 * contributions (the beacon) and the Rust verifier caps entries at 10,000, so a full ceremony's
 * final key stays verifiable. A job spec is a few KB of job, claim and pins plus the head's
 * recorded entries, which grow with the chain: it is sized for `MAX_CONTRIBUTIONS` entries at
 * their largest (h_k and δ as hex and a 64-character name whose every character JSON escapes).
 */
export const MAX_FILE_BYTES = 128 * 1024 * 1024;

export const MAX_CONTRIBUTIONS = 9_999;

export const MAX_INVITED = 1_000;

export const MAX_CIRCUITS = 16;

export const MAX_RECORDS = 100_000;

export const MAX_SECTIONS = 32;

export const MAX_PAYLOAD_BYTES = 16_384;

export const MAX_LOG_CHARS = 1024 * 1024;

export const MAX_DETAIL_CHARS = 1000;

const MAX_HEAD_ENTRY_BYTES = 512;

export const MAX_JOB_SPEC_BYTES = 64 * 1024 + MAX_CONTRIBUTIONS * MAX_HEAD_ENTRY_BYTES;

export const MAX_RELAYS = 8;

export const MAX_DOCUMENT_BYTES = 1024 * 1024;

export const MAX_TRANSCRIPT_BYTES = 64 * 1024 * 1024;

export const MAX_CLAIM_BYTES = 4096;
