/** The contributor a transcript record names for a linked identity, with its link signature. */
import type { Identity, LinkedIdentity } from "./types";

export const contributorOf = (linked: LinkedIdentity): Identity & { linkSignature: string } => ({
  github_id: linked.githubId,
  github_login: linked.login,
  account: linked.account,
  scheme: linked.scheme,
  nonce: linked.nonce,
  issued_at: linked.issuedAt,
  linkSignature: linked.signature,
});
