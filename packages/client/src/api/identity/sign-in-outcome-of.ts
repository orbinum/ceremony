/**
 * The sign-in outcome the GitHub callback put in this page's query (`/?auth=…`), if any. The query
 * is anyone's link: an unknown error reason reads as a GitHub failure, never echoed.
 */
import type { GithubIneligibility, SignInOutcome } from "@orbinum-ceremony/core";

export function signInOutcomeOf(search: string): SignInOutcome | null {
  const q = new URLSearchParams(search);
  switch (q.get("auth")) {
    case "ok":
      return { auth: "ok" };
    case "cancelled":
      return { auth: "cancelled" };
    case "ineligible":
      return {
        auth: "ineligible",
        reasons: (q.get("reasons") ?? "").split(",").filter(Boolean) as GithubIneligibility[],
      };
    case "error": {
      const reason = q.get("reason");
      return {
        auth: "error",
        reason: reason === "state" || reason === "not-configured" ? reason : "github",
      };
    }
    default:
      return null;
  }
}
