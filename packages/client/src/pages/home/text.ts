/** What the page says about coordinator answers and sign-in outcomes. */
import {
  type ApiErrorCode,
  type GithubIneligibility,
  QUEUE_RULES,
  type SignInOutcome,
  ss58PublicKey,
  toBase58,
} from "@orbinum-ceremony/core";
import { ApiError } from "../../api";

const INELIGIBLE: Record<GithubIneligibility, string> = {
  "not-invited": "this ceremony is invite-only and does not invite it",
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
  "not-invited": "This ceremony is invite-only, and this GitHub account is not invited.",
  "nothing-left": "You have already contributed to every circuit.",
  turnstile: "The bot check failed. Solve the new check and join again.",
  "rate-limited": "Too many requests. Wait a minute and try again.",
  "already-linked":
    "The wallet can no longer change: a contribution already names it in the transcript.",
  "wallet-taken": "That wallet is linked to another GitHub account. Pick another one.",
  "attestation-closed":
    "Signing has closed: the ceremony is being sealed with its public beacon. Your contribution is still in the transcript.",
};

/** An error as one sentence for the page. */
export function errorText(e: unknown): string {
  if (e instanceof ApiError) return REFUSALS[e.code] ?? `${e.message} (${e.code})`;
  if (e instanceof Error) return e.message;
  return String(e);
}

/** A long account, its start and end. */
export const shortAccount = (a: string) => (a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);

/**
 * An ed25519 account as a Solana address (the same key, base58): how a Solana contributor finds
 * their own records, which the transcript names in SS58. Null for any other account.
 */
export function solanaFormOf(scheme: string, account: string): string | null {
  if (scheme !== "ed25519") return null;
  try {
    return toBase58(ss58PublicKey(account));
  } catch {
    return null;
  }
}

/** A linked account as the page shows it: scheme, SS58 and, for ed25519, its Solana form. */
export function accountLine(scheme: string, account: string): string {
  const solana = solanaFormOf(scheme, account);
  return `${scheme} · ${shortAccount(account)}${solana ? ` · Solana ${shortAccount(solana)}` : ""}`;
}
