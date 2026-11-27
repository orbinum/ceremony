/**
 * Ends the session, even while a verification is in flight: retried while one is (`busy`) or the
 * coordinator falters, for at most 15 minutes; a session that is already over (any other refusal)
 * is fine. Throws if it never lands, or if the token is refused (the slot then lapses).
 */
import { CONTRIBUTOR_PATHS } from "@orbinum-ceremony/core";
import { type Contributor, contributorCall } from "../../../io";
import { isTransient, refusedWith, sleep, TokenRefused, tokenChecked } from "../retry";

const FINISH_POLL_MS = 2_000;
const FINISH_FOR_MS = 15 * 60_000;

export async function finish(who: Contributor): Promise<void> {
  const deadline = Date.now() + FINISH_FOR_MS;
  for (;;) {
    try {
      await contributorCall(who, "POST", CONTRIBUTOR_PATHS.finish);
      return;
    } catch (error) {
      const refused = tokenChecked(error);
      if (refused instanceof TokenRefused) throw refused;
      if (!refusedWith(error, "busy") && !isTransient(error)) return;
      if (Date.now() > deadline) throw error;
    }
    await sleep(FINISH_POLL_MS);
  }
}
