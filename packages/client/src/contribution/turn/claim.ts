/** Claims the turn; one already claimed (by an earlier attempt whose answer was lost) counts. */
import { ApiError } from "../../api";
import { retrying, sleep } from "../retry";
import type { SessionApi, Sleep } from "../types";

export async function claim(api: Pick<SessionApi, "claimTurn">, wait: Sleep = sleep) {
  try {
    await retrying(() => api.claimTurn(), wait);
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== "already-claimed") throw error;
  }
}
