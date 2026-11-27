/**
 * Time a verification adds per MPC entry it re-walks: about 11 ms measured (shield, Apple
 * M-series, 4,500 entries), three times that for slower hardware. Without it, honest uploads of a
 * long chain would outgrow a fixed bound.
 */
export const PER_ENTRY_MS = 35;
