/**
 * Who may join the queue. Anti-sybil only: identity is never a cryptographic assumption (SPEC
 * §3.1–3.2). Follows p0tion's `githubReputation` (Ethereum Foundation, MIT), plus the rule that
 * the account predates the frozen inputs (`init.json` `created_at`).
 */
import { GITHUB_THRESHOLDS } from "../../config";
import type { InitRecord } from "../../ceremony";
import type { GithubProfile } from "./profile";

/**
 * The moment an account must predate: when the ceremony's inputs were frozen (`init.json`
 * `created_at`). It is published and pinned by the announcement, and earlier than it, so nobody
 * can open an account after learning the ceremony exists.
 */
export const admissionCutoff = (init: Pick<InitRecord, "created_at">): number =>
  Date.parse(init.created_at);

/** Admission thresholds. */
type GithubThresholds = typeof GITHUB_THRESHOLDS;

/** Why an account may not join. `unknown-age`: a date could not be read (fails closed). */
export type GithubIneligibility =
  | "unknown-age"
  | "created-after-cutoff"
  | "account-too-new"
  | "no-public-repos"
  | "too-few-followers"
  | "follows-too-few";

/** Every reason the account may not join (`at.cutoff`: `admissionCutoff`); empty means it may. */
export function githubIneligibility(
  p: GithubProfile,
  at: { cutoff: number; now: number },
  t: GithubThresholds = GITHUB_THRESHOLDS,
): GithubIneligibility[] {
  const created = Date.parse(p.created_at);
  if (![created, at.cutoff, at.now].every(Number.isFinite)) return ["unknown-age"];
  const reasons: GithubIneligibility[] = [];
  if (created >= at.cutoff) reasons.push("created-after-cutoff");
  if (created > at.now - t.minAgeDays * 24 * 60 * 60_000) reasons.push("account-too-new");
  if (p.public_repos < t.minPublicRepos) reasons.push("no-public-repos");
  if (p.followers < t.minFollowers) reasons.push("too-few-followers");
  if (p.following < t.minFollowing) reasons.push("follows-too-few");
  return reasons;
}
