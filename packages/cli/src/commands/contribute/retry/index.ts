/**
 * Waiting and retrying against the coordinator: transient failures are tried again with backoff
 * for a while, a refused token ends the run at once.
 */
export { isTransient } from "./is-transient";
export { refusedWith } from "./refused-with";
export { retrying } from "./retrying";
export { sleep } from "./sleep";
export { tokenChecked } from "./token-checked";
export { TokenRefused } from "./token-refused";
