/**
 * One Turnstile check before a place in the queue (SPEC §4.1): it slows scripted joins; it is not
 * a sybil defence by itself. A token is single use, minutes old, and must have been solved on
 * this coordinator's own host.
 */
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 10_000;

/** Longest token Cloudflare issues; anything longer is refused without asking. */
const MAX_TURNSTILE_TOKEN = 2048;

/** Whether `token` is a valid solve for `hostname`, by a widget rendered for `action`. */
export async function verifyTurnstile(input: {
  secret: string;
  token: string | undefined;
  ip: string | undefined;
  hostname: string;
  action: string;
}): Promise<boolean> {
  const { secret, token, ip, hostname, action } = input;
  if (!token || token.length > MAX_TURNSTILE_TOKEN) return false;
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  try {
    const response = await fetch(SITEVERIFY, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const outcome = (await response.json()) as {
      success?: unknown;
      hostname?: unknown;
      action?: unknown;
    };
    return outcome.success === true && outcome.hostname === hostname && outcome.action === action;
  } catch {
    return false;
  }
}
