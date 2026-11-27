/** What a transcript means beyond its schema: one check per file, each returning its problems. */
export { checkContributable } from "./check-contributable";
export { checkFinalizable } from "./check-finalizable";
export {
  checkIdentities,
  checkInvited,
  checkKnownFinals,
  checkMinContributions,
  checkSealedBeacon,
  checkTranscript,
} from "./finished";
export {
  checkAnchor,
  checkCircuitLinks,
  checkKnownCircuits,
  checkRecordsInWindow,
  checkSimulated,
  checkTranscriptIntegrity,
} from "./integrity";
export { type TranscriptCheck } from "./types";
