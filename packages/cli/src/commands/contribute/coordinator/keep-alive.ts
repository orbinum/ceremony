/**
 * Heartbeats that keep the slot alive until stopped: every 15 s, well inside the slot's 90 s
 * window, the first one at once (a restarted run may be close to its window). The session counts
 * as lost on a refusal (the coordinator ended it, or refused the token) or after 4 transient
 * failures in a row (60 s), never on one; `lost()` is the error that ended it, or null while it
 * holds.
 */
import { CONTRIBUTOR_PATHS } from "@orbinum-ceremony/core";
import { type Contributor, contributorCall } from "../../../io";
import { isTransient, TokenRefused, tokenChecked } from "../retry";

const HEARTBEAT_MS = 15_000;
const HEARTBEAT_FAILURES = 4;

export function keepAlive(who: Contributor) {
  let lost: Error | null = null;
  let failures = 0;
  const beat = () =>
    contributorCall(who, "POST", CONTRIBUTOR_PATHS.heartbeat).then(
      () => {
        failures = 0;
      },
      (error: unknown) => {
        failures += 1;
        if (!isTransient(error) || failures >= HEARTBEAT_FAILURES) {
          const e = tokenChecked(error);
          lost =
            e instanceof TokenRefused
              ? e
              : new Error(
                  `the session ended: ${e instanceof Error ? e.message : "heartbeat failed"}`,
                );
          clearInterval(timer);
        }
      },
    );
  const timer = setInterval(() => void beat(), HEARTBEAT_MS);
  void beat();
  return {
    lost: () => lost,
    stop: () => clearInterval(timer),
  };
}
