// core/coordination/protocol: the wire contracts (coordinator ↔ verifier, client, operator).
export { ADMIN_PATHS, CONTENT_SHA256_HEADER } from "./admin";
export {
  authHeadersWellFormed,
  timestampFresh,
  checkHmacKey,
  SIGNATURE_HEADER,
  signedRequestInit,
  signRequest,
  TIMESTAMP_HEADER,
  verifyRequest,
} from "./auth";
export { type ApiErrorCode, apiErrorStatus, type CeremonyRefusal } from "./errors";
export {
  attemptLogKey,
  isJobObjectKey,
  jobKey,
  jobObjectKey,
  jobObjectPrefix,
  jobResultView,
  jobSpecOf,
  newJob,
} from "./jobs";
export {
  CLAIM_HEADER,
  CONTRIBUTOR_PATHS,
  DEV_IDENTITY_HEADERS,
  INTERNAL_PATHS,
  OPERATOR_HEADER,
  VERIFIER_PATHS,
} from "./paths";
export {
  contributionInputOf,
  publishedLogOf,
  reconcileReport,
  reportOf,
  storedReport,
  verifierLogOf,
} from "./report";
export { type SignInOutcome, signInQuery } from "./signin";
export {
  type ContributionClaim,
  type FinalizeRequest,
  type Job,
  type JobId,
  type JobSpec,
  type StoredReport,
  type VerifierReport,
} from "./types";
export {
  validateClaim,
  validateFinalizeRequest,
  validateUnholdRequest,
  validateJobId,
  validateJobSpec,
  validateReport,
} from "./validate";
