/**
 * How a sign-in ends, as the client reads it from the query of the page the callback redirects to
 * (`/?auth=…`). The signed-in profile itself stays on the coordinator.
 */
import type { GithubIneligibility } from "../admission";

export type SignInOutcome =
  | { auth: "ok" }
  | { auth: "cancelled" }
  | { auth: "ineligible"; reasons: GithubIneligibility[] }
  | { auth: "error"; reason: "state" | "not-configured" | "github" };

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
