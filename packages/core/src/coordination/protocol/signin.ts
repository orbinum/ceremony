/**
 * How a sign-in ends, as the client reads it from the query of the page the callback redirects
 * to (`/?auth=…`). SPEC §3.2.
 */
import type { GithubIneligibility } from "../admission";

/** The outcome of a sign-in attempt (the signed-in profile stays on the coordinator). */
export type SignInOutcome =
  | { auth: "ok" }
  | { auth: "cancelled" }
  | { auth: "ineligible"; reasons: GithubIneligibility[] }
  | { auth: "error"; reason: "state" | "not-configured" | "github" };

/** The query string the client reads an outcome from. */
export function signInQuery(o: SignInOutcome): string {
  switch (o.auth) {
    case "ok":
    case "cancelled":
      return `auth=${o.auth}`;
    case "ineligible":
      return `auth=ineligible&reasons=${o.reasons.join(",")}`;
    case "error":
      return `auth=error&reason=${o.reason}`;
  }
}
