/** What the page says about coordinator answers and sign-in outcomes. */
import {
  type ApiErrorCode,
  type GithubIneligibility,
  QUEUE_RULES,
  type SignInOutcome,
} from "@orbinum-ceremony/core";
import { ApiError } from "../../api";

const INELIGIBLE: Record<GithubIneligibility, string> = {
  "unknown-age": "GitHub did not report when the account was created",
  "created-after-cutoff": "the account was created after the ceremony was announced",
  "account-too-new": "the account is less than 30 days old",
  "no-public-repos": "the account has no public repositories",
  "too-few-followers": "the account has no followers",
  "follows-too-few": "the account follows fewer than 5 accounts",
};

/** A sign-in outcome as one sentence, or null when there is nothing to say. */
/** Before the operator publishes the ceremony, nobody can sign in (its admission rules come with it). */
export const NOT_ANNOUNCED =
  "The ceremony has not been announced yet. Sign-in opens once it is; check back soon.";

export function signInText(o: SignInOutcome): string | null {
  switch (o.auth) {
    case "ok":
      return null;
    case "cancelled":
      return "Sign-in was cancelled.";
    case "ineligible": {
      // Only reasons this page knows: the query is anyone's link, so its text is never shown.
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

/** Refusals a contributor can act on, in their words. */
const REFUSALS: Partial<Record<ApiErrorCode, string>> = {
  cooldown: `${QUEUE_RULES.noShowsForCooldown} turns passed without starting, so joining is paused for ${QUEUE_RULES.cooldownMs / 60_000} minutes. Join again when you can start right away.`,
  "not-open": "The line is closed: the ceremony is not open.",
  "already-queued": "You are already in line.",
  banned: `This account can no longer contribute: its uploads were rejected ${QUEUE_RULES.maxRejected} times.`,
  held: "This account is on hold. Contact the ceremony operators.",
  "nothing-left": "You have already contributed to every circuit.",
  turnstile: "The bot check failed. Solve the new check and join again.",
  "rate-limited": "Too many requests. Wait a minute and try again.",
  "already-linked":
    "The wallet can no longer change: a contribution already names it in the transcript.",
  "wallet-taken": "That wallet is linked to another GitHub account. Pick another one.",
};

/** An error as one sentence for the page. */
export function errorText(e: unknown): string {
  if (e instanceof ApiError) return REFUSALS[e.code] ?? `${e.message} (${e.code})`;
  if (e instanceof Error) return e.message;
  return String(e);
}

/** A long account, its start and end. */
export const shortAccount = (a: string) => (a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);
