/** The ceremony's lifecycle. SPEC §4.3. */

/** States in order: a ceremony only ever moves forward, except OPEN ⇄ PAUSED. */
export const CEREMONY_STATES = ["SCHEDULED", "OPEN", "PAUSED", "CLOSED", "FINALIZED"] as const;

/** One lifecycle state. */
export type CeremonyState = (typeof CEREMONY_STATES)[number];
