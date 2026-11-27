/**
 * The operator's state actions (`POST /admin/state`). Finalizing takes the sealed beacon and the
 * finals, so it has its own route.
 */
export const OPERATOR_ACTIONS = ["pause", "resume", "close"] as const;
