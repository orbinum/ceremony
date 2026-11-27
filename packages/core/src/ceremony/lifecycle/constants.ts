/**
 * The ceremony's lifecycle states, in order: a ceremony only ever moves forward, except
 * OPEN ⇄ PAUSED.
 */
export const CEREMONY_STATES = ["SCHEDULED", "OPEN", "PAUSED", "CLOSED", "FINALIZED"] as const;
