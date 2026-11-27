/** A link payload for the GitHub identity the session vouches for, issued at `now` (epoch ms). */
import type { LinkPayload } from "../../ceremony";

export const buildLinkPayload = (input: {
  ceremonyId: string;
  githubId: number;
  githubLogin: string;
  account: string;
  nonce: string;
  now: number;
}): LinkPayload => ({
  ceremony_id: input.ceremonyId,
  github_id: input.githubId,
  github_login: input.githubLogin,
  account: input.account,
  nonce: input.nonce,
  issued_at: Math.floor(input.now / 1000),
});
