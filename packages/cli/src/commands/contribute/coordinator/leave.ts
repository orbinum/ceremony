/** `POST /api/queue/leave`, best effort: a run that stops while waiting gives its place back. */
import { CONTRIBUTOR_PATHS } from "@orbinum-ceremony/core";
import { type Contributor, contributorCall } from "../../../io";
import { retrying } from "../retry";

export async function leave(who: Contributor): Promise<boolean> {
  try {
    await retrying(() => contributorCall(who, "POST", CONTRIBUTOR_PATHS.leave));
    return true;
  } catch {
    return false;
  }
}
