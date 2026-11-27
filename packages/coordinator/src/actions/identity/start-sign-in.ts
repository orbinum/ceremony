/**
 * A new sign-in with GitHub: a fresh OAuth state and PKCE verifier, to be bound to the browser, and
 * the authorization URL to send it to.
 */
import { authorizeUrl, randomHex } from "../../services";
import { callbackUrl } from "./callback-url";

export function startSignIn(env: Env, origin: string) {
  const state = randomHex(16);
  const verifier = randomHex(32);
  return {
    state,
    verifier,
    url: authorizeUrl(env.GITHUB_CLIENT_ID, callbackUrl(origin), state, verifier),
  };
}
