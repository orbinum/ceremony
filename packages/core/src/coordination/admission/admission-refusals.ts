/**
 * Every reason an account may not join this ceremony; empty means it may. An invited account skips
 * the thresholds (the pinned announcement names it); a closed ceremony admits nobody else.
 */
import { type CeremonyAnnouncement, isClosed, isInvited } from "../../ceremony";
import { githubIneligibility } from "./github-ineligibility";
import type { GithubIneligibility, GithubProfile } from "./types";

export function admissionRefusals(
  a: CeremonyAnnouncement,
  p: GithubProfile,
  at: { cutoff: number; now: number },
): GithubIneligibility[] {
  if (isInvited(a, p.id)) return [];
  return isClosed(a) ? ["not-invited"] : githubIneligibility(p, at);
}
