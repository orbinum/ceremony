/**
 * Sign-in with GitHub (SPEC §3.2): OAuth with a state and a PKCE verifier bound to the browser,
 * each state spent once; admission (the announced invitations, then the thresholds) is checked
 * once, here, and only an admitted account is signed in.
 */
import {
  admissionCutoff,
  admissionRefusals,
  type GithubProfile,
  type SignInOutcome,
  timingSafeEqual,
} from "@orbinum-ceremony/core";
import { ceremony } from "../durable";
import { authorizeUrl, exchangeCode, fetchProfile, randomHex } from "../services";

/** Where the callback lands, on this origin. */
const callbackUrl = (origin: string) => `${origin}/auth/github/callback`;

/** A new attempt: what to bind to the browser, and where to send it. */
export function startSignIn(env: Env, origin: string) {
  const state = randomHex(16);
  const verifier = randomHex(32);
  return {
    state,
    verifier,
    url: authorizeUrl(env.GITHUB_CLIENT_ID, callbackUrl(origin), state, verifier),
  };
}

/** How a sign-in ended (core's wire outcome) and, when it succeeded, who signed in. */
export type SignIn = { outcome: SignInOutcome; profile?: GithubProfile };

const ended = (outcome: SignInOutcome): SignIn => ({ outcome });

/** The callback: the attempt this browser started, GitHub's answer, then admission. */
export async function completeSignIn(
  env: Env,
  origin: string,
  query: { code?: string; state?: string; error?: string },
  expected: { state: string; verifier: string } | null,
): Promise<SignIn> {
  const { code, state, error } = query;
  if (error) return ended({ auth: "cancelled" });
  if (!expected || !code || !state || !timingSafeEqual(state, expected.state)) {
    return ended({ auth: "error", reason: "state" });
  }
  const stub = ceremony(env);
  const setup = await stub.setup();
  if (!setup) return ended({ auth: "error", reason: "not-configured" });
  // Single use: a copied state cookie cannot complete a second sign-in.
  if (!(await stub.spendOAuthState(state))) return ended({ auth: "error", reason: "state" });
  let profile: GithubProfile;
  try {
    const token = await exchangeCode({
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      code,
      redirectUri: callbackUrl(origin),
      verifier: expected.verifier,
    });
    profile = await fetchProfile(token);
  } catch (e) {
    console.error(e);
    return ended({ auth: "error", reason: "github" });
  }
  const reasons = admissionRefusals(setup.announcement, profile, {
    cutoff: admissionCutoff(setup.init),
    now: Date.now(),
  });
  return reasons.length > 0
    ? ended({ auth: "ineligible", reasons })
    : { outcome: { auth: "ok" }, profile };
}
