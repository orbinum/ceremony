/**
 * The GitHub OAuth callback: the attempt this browser started (state compared in constant time and
 * spent once, so a copied state cookie cannot complete a second sign-in), GitHub's answer, then
 * admission (the announced invitations, then the thresholds), checked once, here. Only an admitted
 * account comes back with a profile to sign in.
 */
import {
  admissionCutoff,
  admissionRefusals,
  type GithubProfile,
  type SignInOutcome,
  timingSafeEqual,
} from "@orbinum-ceremony/core";
import { ceremony } from "../../durable";
import { exchangeCode, fetchProfile } from "../../services";
import { callbackUrl } from "./callback-url";

export type SignIn = { outcome: SignInOutcome; profile?: GithubProfile };

const ended = (outcome: SignInOutcome): SignIn => ({ outcome });

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
