/**
 * An error as one sentence for the page: a refusal a contributor can act on in their words, with
 * the queue's own numbers; any other refusal as the coordinator's message and code.
 */
import { type ApiErrorCode, QUEUE_RULES } from "@orbinum-ceremony/core";
import { ApiError } from "../../../api";

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

export function errorText(e: unknown): string {
  if (e instanceof ApiError) return REFUSALS[e.code] ?? `${e.message} (${e.code})`;
  if (e instanceof Error) return e.message;
  return String(e);
}
