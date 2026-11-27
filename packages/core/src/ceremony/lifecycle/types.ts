/** One lifecycle state of the ceremony. */
import type { CEREMONY_STATES } from "./constants";

export type CeremonyState = (typeof CEREMONY_STATES)[number];
