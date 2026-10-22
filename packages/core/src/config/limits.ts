/** Hard bounds on everything read from outside, far above an honest ceremony. SPEC §7, KL-17. */

/** Largest file any component reads whole: the ptau is 75 MB, the largest zkey ~17 MB. */
export const MAX_FILE_BYTES = 128 * 1024 * 1024;

/**
 * Contributions per circuit. A final zkey holds one more MPC entry (the beacon), and the Rust
 * verifier caps entries at 10,000, so a full ceremony's final key stays verifiable.
 */
export const MAX_CONTRIBUTIONS = 9_999;

/** Records in one transcript: contributions, attestations, state changes and the beacon. */
export const MAX_RECORDS = 100_000;

/** Sections in an iden3 binfile: real zkeys have 10, r1cs files 3. */
export const MAX_SECTIONS = 32;

/** Canonical JSON of one attestation payload, in UTF-8 bytes. */
export const MAX_PAYLOAD_BYTES = 16_384;

/** A `zkey verify` log is a few KB. */
export const MAX_LOG_CHARS = 1024 * 1024;

/** Free-text detail of a verifier result. */
export const MAX_DETAIL_CHARS = 1000;

/**
 * One recorded entry of a job spec's head, as JSON at its largest: h_k and δ as hex, and a
 * 64-character name whose every character JSON escapes (`\"` or `\\`), plus keys and separators.
 */
const MAX_HEAD_ENTRY_BYTES = 512;

/**
 * A job spec (coordinator → verifier): a few KB of job, claim and pins, plus the head's recorded
 * entries, which grow with the chain. Sized for `MAX_CONTRIBUTIONS` worst-case entries.
 */
export const MAX_JOB_SPEC_BYTES = 64 * 1024 + MAX_CONTRIBUTIONS * MAX_HEAD_ENTRY_BYTES;

/** drand relays recorded with a sealed beacon. */
export const MAX_RELAYS = 8;

/** `ceremony.json` or `genesis/init.json`: a few KB each. */
export const MAX_DOCUMENT_BYTES = 1024 * 1024;

/** `transcript.json`: about 2 KB per record. */
export const MAX_TRANSCRIPT_BYTES = 64 * 1024 * 1024;

/** An upload's claim header: a few hundred bytes of JSON. */
export const MAX_CLAIM_BYTES = 4096;
