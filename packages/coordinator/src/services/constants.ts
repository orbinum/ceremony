/**
 * Constants the service clients share: the header Cloudflare Access sets on requests it let
 * through, and how the GitHub OAuth client calls GitHub (JSON, its own user agent, a time limit).
 */
export const ACCESS_HEADER = "cf-access-jwt-assertion";

export const GITHUB_HEADERS = {
  accept: "application/json",
  "user-agent": "orbinum-ceremony-coordinator",
};

export const GITHUB_TIMEOUT_MS = 10_000;
