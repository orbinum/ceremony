/**
 * The turn around the contributions (SPEC §4.2): claiming it, keeping it with heartbeats, and
 * ending it — by the attestation, or by `finish` when there is none.
 */
import { ApiError, isTransient } from "../api";
import { retrying, type Sleep, sleep } from "./retry";
import type { SessionApi } from "./types";

/** Heartbeats every 15 s keep the slot well inside its 90 s window. */
const HEARTBEAT_MS = 15_000;
/** Consecutive transient failures (a minute) before the turn is given up for lost. */
const HEARTBEAT_FAILURES = 4;
/** Ending waits at most this long for a verification in flight to settle (`busy`). */
const FINISH_FOR_MS = 15 * 60_000;
const FINISH_POLL_MS = 2_000;

/** Claims the turn; one already claimed (by an earlier attempt whose answer was lost) counts. */
export async function claim(api: Pick<SessionApi, "claimTurn">, wait: Sleep = sleep) {
  try {
    await retrying(() => api.claimTurn(), wait);
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== "already-claimed") throw error;
  }
}

/** A running heartbeat: why the turn was lost (null while it holds), and how to stop it. */
export interface Heart {
  lost(): Error | null;
  stop(): void;
}

/**
 * Heartbeats until stopped, the first at once. The turn counts as lost on a refusal (the
 * coordinator ended it) or after `HEARTBEAT_FAILURES` transient failures in a row, never on one.
 */
export function keepAlive(api: Pick<SessionApi, "heartbeat">, everyMs = HEARTBEAT_MS): Heart {
  let lost: Error | null = null;
  let failures = 0;
  const beat = () =>
    api.heartbeat().then(
      () => {
        failures = 0;
      },
      (error: unknown) => {
        failures += 1;
        if (!isTransient(error) || failures >= HEARTBEAT_FAILURES) {
          const why = error instanceof Error ? error.message : "heartbeat failed";
          lost = new Error(`your turn ended: ${why}`);
          clearInterval(timer);
        }
      },
    );
  const timer = setInterval(() => void beat(), everyMs);
  void beat();
  return { lost: () => lost, stop: () => clearInterval(timer) };
}

/**
 * Ends the turn without an attestation: retried while a verification is in flight (`busy`) or the
 * coordinator falters; a turn already over (any other refusal) is fine.
 */
export async function finish(api: Pick<SessionApi, "finishSession">, wait: Sleep = sleep) {
  const deadline = Date.now() + FINISH_FOR_MS;
  for (;;) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- one attempt after the other
      await api.finishSession();
      return;
    } catch (error) {
      const busy = error instanceof ApiError && error.code === "busy";
      if (!busy && !isTransient(error)) return;
      if (Date.now() > deadline) throw error;
    }
    // oxlint-disable-next-line no-await-in-loop -- waits for the verification to settle
    await wait(FINISH_POLL_MS);
  }
}
