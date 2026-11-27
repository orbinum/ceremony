/** `POST /api/session/claim`, retried; a claim that already landed (its answer lost) counts. */
import { CONTRIBUTOR_PATHS } from "@orbinum-ceremony/core";
import { type Contributor, contributorCall } from "../../../io";
import { refusedWith, retrying } from "../retry";

export async function claim(who: Contributor, signal?: AbortSignal): Promise<void> {
  try {
    await retrying(() => contributorCall(who, "POST", CONTRIBUTOR_PATHS.claim, { signal }), signal);
  } catch (error) {
    if (!refusedWith(error, "already-claimed")) throw error;
  }
}
