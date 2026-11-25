// core/coordination/admission: who may join the queue (SPEC §3.2).
export {
  admissionCutoff,
  admissionRefusals,
  admittedJoin,
  type GithubIneligibility,
  githubIneligibility,
} from "./eligibility";
export { type GithubProfile, validateGithubProfile } from "./profile";
export { validateSessionClaims } from "./session";
