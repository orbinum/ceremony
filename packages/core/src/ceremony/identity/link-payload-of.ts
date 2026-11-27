/** The exact payload a recorded identity's link signature signs. */
import type { Identity, LinkPayload } from "./types";

export const linkPayloadOf = (ceremonyId: string, identity: Identity): LinkPayload => ({
  ceremony_id: ceremonyId,
  github_id: identity.github_id,
  github_login: identity.github_login,
  account: identity.account,
  nonce: identity.nonce,
  issued_at: identity.issued_at,
});
