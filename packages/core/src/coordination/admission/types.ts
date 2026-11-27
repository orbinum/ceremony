/**
 * Types of admission: the GitHub profile fields the rules read (everything else is ignored) and
 * why an account may not join. `unknown-age`: a date could not be read, so admission fails closed;
 * `not-invited`: a closed ceremony does not name the account.
 */
export interface GithubProfile {
  id: number;
  login: string;
  created_at: string;
  public_repos: number;
  following: number;
}

export type GithubIneligibility =
  | "not-invited"
  | "unknown-age"
  | "created-after-cutoff"
  | "account-too-new"
  | "no-public-repos"
  | "follows-too-few";
