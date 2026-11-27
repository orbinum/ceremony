/** A request body past `MAX_JOB_SPEC_BYTES`, answered 413 whatever its headers said. */
export class TooLarge extends Error {}
