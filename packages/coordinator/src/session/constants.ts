/**
 * The sign-in cookies: the session and the OAuth attempt. `__Host-` means Secure, Path=/ and no
 * Domain, so neither can be set or read by a subdomain; both are HttpOnly and SameSite=Lax.
 */
export const SESSION_COOKIE = "__Host-ceremony-session";

export const STATE_COOKIE = "__Host-oauth-state";

export const COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: "Lax", path: "/" } as const;
