/**
 * The operator's state actions (`POST /admin/state`), and every queue event only the operator sends
 * (those and lifting a hold, `POST /admin/unhold`). Finalizing takes the sealed beacon and the
 * finals, so it has its own route.
 */
export const OPERATOR_ACTIONS = ["pause", "resume", "close"] as const;

export const OPERATOR_EVENTS = [...OPERATOR_ACTIONS, "unhold"] as const;
