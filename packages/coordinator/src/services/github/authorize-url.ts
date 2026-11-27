/**
 * Where the browser goes to sign in with GitHub: the authorization-code flow with a PKCE (S256)
 * challenge, `base64url(SHA-256(verifier))`. No scope is requested, since the public profile is all
 * admission needs, and no sign-up is offered.
 */
import { sha256Bytes, toBase64url, utf8 } from "@orbinum-ceremony/core";

const pkceChallenge = (verifier: string): string => toBase64url(sha256Bytes(utf8(verifier)));

export function authorizeUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  verifier: string,
): string {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    allow_signup: "false",
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}
