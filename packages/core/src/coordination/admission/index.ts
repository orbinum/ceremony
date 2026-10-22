// core/coordination/admission: who may join the queue (SPEC §3.2).
export { admissionCutoff, type GithubIneligibility, githubIneligibility } from "./eligibility";
export { type GithubProfile, validateGithubProfile } from "./profile";
export { validateSessionClaims } from "./session";
