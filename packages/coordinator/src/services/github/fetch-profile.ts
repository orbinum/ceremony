/**
 * The signed-in account's public GitHub profile, validated. The access token is used once, for
 * `GET /user`, and never stored.
 */
import { type GithubProfile, validateGithubProfile } from "@orbinum-ceremony/core";
import { GITHUB_HEADERS, GITHUB_TIMEOUT_MS } from "../constants";

export async function fetchProfile(accessToken: string): Promise<GithubProfile> {
  const response = await fetch("https://api.github.com/user", {
    headers: { ...GITHUB_HEADERS, authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`GitHub /user failed (${response.status})`);
  return validateGithubProfile(await response.json());
}
