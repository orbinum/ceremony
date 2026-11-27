/** The values the coordinator's session API may answer for a slot's circuits and for a verdict. */

export const SLOT_STATUSES = ["todo", "verifying", "accepted", "skipped"] as const;

export const RESULTS = ["pending", "valid", "rejected", "ambiguous", "infra", "stale"] as const;
