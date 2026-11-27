/**
 * The coordinator's session API as `contribute` uses it: every answer validated before anything
 * uses it, transient failures retried, the slot kept alive, and the session ended even while a
 * verification is in flight.
 */
export { claim } from "./claim";
export { finish } from "./finish";
export { headOf } from "./head-of";
export { keepAlive } from "./keep-alive";
export { leave } from "./leave";
export { placeOf } from "./place-of";
export type { Head, SlotView, Verdict } from "./types";
export { upload } from "./upload";
export { verdictOf } from "./verdict-of";
