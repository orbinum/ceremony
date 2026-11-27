/**
 * The GitHub access token for an OAuth callback's `code`, exchanged with the client secret the
 * Worker holds and the PKCE verifier; throws on any failure.
 */
import { GITHUB_HEADERS, GITHUB_TIMEOUT_MS } from "../constants";

export async function exchangeCode(input: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  verifier: string;
}): Promise<string> {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { ...GITHUB_HEADERS, "content-type": "application/json" },
    body: JSON.stringify({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.verifier,
    }),
    signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
  });
  const body = (await response.json().catch(() => null)) as { access_token?: unknown } | null;
  if (!response.ok || typeof body?.access_token !== "string") {
    throw new Error(`GitHub code exchange failed (${response.status})`);
  }
  return body.access_token;
}
