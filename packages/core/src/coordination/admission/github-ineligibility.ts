/**
 * Every reason a GitHub account may not join the queue; empty means it may. Anti-sybil only:
 * identity is never a cryptographic assumption. Follows p0tion's `githubReputation` (Ethereum
 * Foundation, MIT), plus the rule that the account predates the frozen inputs (`admissionCutoff`).
 */
import { GITHUB_THRESHOLDS } from "../../config";
import type { GithubIneligibility, GithubProfile } from "./types";

export function githubIneligibility(
  p: GithubProfile,
  at: { cutoff: number; now: number },
  t: typeof GITHUB_THRESHOLDS = GITHUB_THRESHOLDS,
): GithubIneligibility[] {
  const created = Date.parse(p.created_at);
  if (![created, at.cutoff, at.now].every(Number.isFinite)) return ["unknown-age"];
  const reasons: GithubIneligibility[] = [];
  if (created >= at.cutoff) reasons.push("created-after-cutoff");
  if (created > at.now - t.minAgeDays * 24 * 60 * 60_000) reasons.push("account-too-new");
  if (p.public_repos < t.minPublicRepos) reasons.push("no-public-repos");
  if (p.following < t.minFollowing) reasons.push("follows-too-few");
  return reasons;
}
