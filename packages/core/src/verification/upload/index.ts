// core/verification/upload: acceptance of one upload before pairings (SPEC §2.5).
export { checkContinuity, CONTINUITY_FAILURES, type HeadExpectation } from "./continuity";
export {
  logLine,
  REJECT_REASONS,
  type RejectReason,
  type VerificationResult,
  zkeyVerifyPassed,
} from "./contract";
export { checkAgainstGenesis, type GenesisLayout, genesisLayoutOf } from "./genesis";
export { isStaleHead, maxUploadSize } from "./limits";
export { type CurrentHead, precheckUpload, type UploadClaim } from "./precheck";
