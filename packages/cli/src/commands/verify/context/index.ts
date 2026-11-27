/**
 * What every `verify` check builds on: the loaded and staged context, the staged inputs (a throw
 * for one that failed to stage), its scratch directory, and the gate bound to it.
 */
export { attemptGated } from "./attempt-gated";
export { loadContext } from "./load-context";
export { markFailed } from "./mark-failed";
export { staged } from "./staged";
export { stagedPtau } from "./staged-ptau";
export { workDir } from "./work-dir";
