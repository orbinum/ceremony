/**
 * Whether a Turnstile token is a valid solve on this coordinator's own host, by a widget rendered
 * for `action`. A token is single use and minutes old; one longer than Cloudflare ever issues is
 * refused without asking, and any failure to ask is a refusal.
 */
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 10_000;

const MAX_TURNSTILE_TOKEN = 2048;

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
