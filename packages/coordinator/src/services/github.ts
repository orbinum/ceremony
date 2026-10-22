/**
 * GitHub OAuth, authorization-code flow with PKCE (S256) and the client secret held by the
 * Worker. The access token is used once, for `GET /user`, and never stored; no scope is
 * requested, the public profile is all admission needs. SPEC §3.2.
 */
import {
  type GithubProfile,
  sha256Bytes,
  toBase64url,
  utf8,
  validateGithubProfile,
} from "@orbinum-ceremony/core";

const TIMEOUT_MS = 10_000;
const HEADERS = { accept: "application/json", "user-agent": "orbinum-ceremony-coordinator" };

/** The PKCE challenge of a verifier: `base64url(SHA-256(verifier))`. */
const pkceChallenge = (verifier: string): string => toBase64url(sha256Bytes(utf8(verifier)));

/** Where the browser goes to sign in. */
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

/** The access token for a callback's `code`; throws on any failure. */
export async function exchangeCode(input: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  verifier: string;
}): Promise<string> {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { ...HEADERS, "content-type": "application/json" },
    body: JSON.stringify({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.verifier,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await response.json().catch(() => null)) as { access_token?: unknown } | null;
  if (!response.ok || typeof body?.access_token !== "string") {
    throw new Error(`GitHub code exchange failed (${response.status})`);
  }
  return body.access_token;
}

/** The signed-in account's public profile, validated. */
export async function fetchProfile(accessToken: string): Promise<GithubProfile> {
  const response = await fetch("https://api.github.com/user", {
    headers: { ...HEADERS, authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`GitHub /user failed (${response.status})`);
  return validateGithubProfile(await response.json());
}
