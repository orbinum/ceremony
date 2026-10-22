// cli/tests/support: real and synthetic ceremonies, tampering, local servers and errors.
export {
  CIRCUITS_REPO,
  finalizedCeremony,
  opened,
  PTAU_PATH,
  RELEASE,
  RUST_VERIFIER,
  sealRound,
  shieldOnlyCeremony,
  type TestCeremony,
  VK_PACKER,
} from "./ceremony";
export { CLOCK, ROUND_1000, ROUND_1001, scheduleFor, T_ROUND } from "./clock";
export { rejection } from "./errors";
export { json, localServer, serveDir } from "./http";
export {
  type Synthetic,
  SYNTHETIC_RELEASE,
  syntheticCeremony,
  type SyntheticOptions,
} from "./synthetic";
export { editJson, failedChecks, failures, rewriteHistory, tamperedCopy } from "./tamper";
