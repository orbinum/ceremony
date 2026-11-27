/**
 * Ends the turn without an attestation: retried while a verification is in flight (`busy`) or the
 * coordinator falters, for at most `FINISH_FOR_MS`; a turn already over (any other refusal) is
 * fine.
 */
import { ApiError, isTransient } from "../../api";
import { FINISH_FOR_MS, FINISH_POLL_MS } from "../constants";
import { sleep } from "../retry";
import type { SessionApi, Sleep } from "../types";

export async function finish(api: Pick<SessionApi, "finishSession">, wait: Sleep = sleep) {
  const deadline = Date.now() + FINISH_FOR_MS;
  for (;;) {
    try {
      // oxlint-disable-next-line no-await-in-loop
      await api.finishSession();
      return;
    } catch (error) {
      const busy = error instanceof ApiError && error.code === "busy";
      if (!busy && !isTransient(error)) return;
      if (Date.now() > deadline) throw error;
    }
    // oxlint-disable-next-line no-await-in-loop
    await wait(FINISH_POLL_MS);
  }
}
