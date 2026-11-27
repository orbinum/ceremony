/**
 * Heartbeats until stopped, the first at once, keeping the claimed turn. The turn counts as lost
 * on a refusal (the coordinator ended it) or after `HEARTBEAT_FAILURES` transient failures in a
 * row, never on one. A `Heart` says why it was lost (null while it holds) and stops it.
 */
import { isTransient } from "../../api";
import { HEARTBEAT_FAILURES, HEARTBEAT_MS } from "../constants";
import type { SessionApi } from "../types";

export interface Heart {
  lost(): Error | null;
  stop(): void;
}

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
