/**
 * Who the browser is (SPEC §3.2–3.4): the GitHub sign-in and its outcome, the linked wallet, the
 * CLI token, sign-out.
 */
import type {
  GithubIneligibility,
  LinkPayload,
  Scheme,
  SignInOutcome,
} from "@orbinum-ceremony/core";
import { ApiError, call } from "./http";

/** `GET /api/link`: who is signed in, in which ceremony, and their linked wallet. */
export interface Me {
  ceremonyId: string;
  githubId: number;
  login: string;
  linked: {
    scheme: Scheme;
    account: string;
    linkedAt: number;
    /** Why the wallet cannot be changed now: a contribution names it, or it is this account's turn. */
    changeRefusal: "already-linked" | "busy" | null;
  } | null;
}

/** Who is signed in; null when nobody is. */
export async function getMe(): Promise<Me | null> {
  try {
    return await call<Me>("GET", "/api/link");
  } catch (e) {
    if (e instanceof ApiError && e.code === "unauthenticated") return null;
    throw e;
  }
}

/** A single-use nonce for the link payload. */
export const linkNonce = () =>
  call<{ nonce: string; expiresAt: number }>("POST", "/api/link/nonce");

/** Binds the wallet that signed `payload` to the signed-in account. */
export const linkWallet = (scheme: Scheme, payload: LinkPayload, signature: string) =>
  call<{ ok: true }>("POST", "/api/link", { scheme, payload, signature });

/** A token for `orbinum-ceremony contribute`, valid as long as this session. */
export const cliToken = () =>
  call<{ ok: true; token: string; expiresAt: number }>("POST", "/api/cli-token");

export const signOut = () => call<{ ok: true }>("POST", "/auth/logout");

/** The sign-in outcome the callback put in this page's query (`/?auth=…`), if any. */
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
