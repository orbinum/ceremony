/**
 * Why a signed link payload does not belong to this session, or null if it does: it must name the
 * session's ceremony and identity, and be issued within the allowed clock skew.
 */
import { LINK_RULES } from "../../config";
import type { LinkPayload } from "../../ceremony";

export function checkLink(
  payload: LinkPayload,
  session: { ceremonyId: string; githubId: number; githubLogin: string },
  now: number,
): "wrong-identity" | "stale-signature" | null {
  if (
    payload.ceremony_id !== session.ceremonyId ||
    payload.github_id !== session.githubId ||
    payload.github_login !== session.githubLogin
  ) {
    return "wrong-identity";
  }
  return Math.abs(now / 1000 - payload.issued_at) > LINK_RULES.maxSkewS ? "stale-signature" : null;
}
