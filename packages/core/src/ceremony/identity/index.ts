// core/ceremony/identity: contributors, client builds, what wallets sign and how it verifies.
export { asAccount, asStoredSignature, asWalletSignature, evmAccountKey } from "./account";
export { attestationTypedData, eip712Domain, linkTypedData, type TypedData } from "./eip712";
export { ethersTypedData } from "./ethers";
export {
  checkRelink,
  contributorOf,
  type LinkedIdentity,
  linkPayloadOf,
  validateAttestationRequest,
  validateLinkRequest,
} from "./linked";
export { sr25519Message } from "./sr25519";
export {
  type AttestationPayload,
  type AttestedContribution,
  type ClientInfo,
  CONTRIBUTION_METHODS,
  type ContributionMethod,
  type Identity,
  type LinkPayload,
  type Scheme,
  SCHEMES,
} from "./types";
export {
  asClientInfo,
  asGithubLogin,
  asIdentity,
  LOCAL_BUILD,
  LOCAL_VERIFIER,
  validateAttestationPayload,
  validateLinkPayload,
} from "./validate";
export { accountKey, verifyAttestation, verifyLink } from "./verify";
