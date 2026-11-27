/**
 * A sign-in outcome as one sentence, or null when there is nothing to say. Only ineligibility
 * reasons this page knows are worded: the query is anyone's link, so its text is never shown.
 */
import type { GithubIneligibility, SignInOutcome } from "@orbinum-ceremony/core";
import { NOT_ANNOUNCED } from "./constants";

const INELIGIBLE: Record<GithubIneligibility, string> = {
  "not-invited": "this ceremony is invite-only and does not invite it",
  "unknown-age": "GitHub did not report when the account was created",
  "created-after-cutoff": "the account was created after the ceremony was announced",
  "account-too-new": "the account is less than 30 days old",
  "no-public-repos": "the account has no public repositories",
  "follows-too-few": "the account follows fewer than 5 accounts",
};

export function signInText(o: SignInOutcome): string | null {
  switch (o.auth) {
    case "ok":
      return null;
    case "cancelled":
      return "Sign-in was cancelled.";
    case "ineligible": {
      const known = o.reasons.filter((r) => Object.hasOwn(INELIGIBLE, r)).map((r) => INELIGIBLE[r]);
      return known.length > 0
        ? `This GitHub account cannot join: ${known.join("; ")}.`
        : "This GitHub account cannot join.";
    }
    case "error":
      if (o.reason === "state") return "Sign-in expired or came from another tab. Try again.";
      if (o.reason === "not-configured") return NOT_ANNOUNCED;
      return "Sign-in failed. Try again later.";
  }
}
