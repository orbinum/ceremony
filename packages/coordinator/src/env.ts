/**
 * The Worker's bindings and request variables, when a run counts as local, and the configuration
 * checks a deployment must pass before it serves anything. COORDINATOR §3.
 */
import {
  asCeremonyId,
  hmacKeyForm,
  keyBytes,
  LOOPBACK_HOSTS,
  MIN_KEY_BYTES,
} from "@orbinum-ceremony/core";

declare global {
  /**
   * Optional secrets, outside `wrangler.jsonc`'s required list: the Cloudflare Access service
   * token of the application in front of the verifier's Tunnel (KL-45). Set both or neither.
   */
  interface Env {
    VERIFIER_ACCESS_CLIENT_ID?: string;
    VERIFIER_ACCESS_CLIENT_SECRET?: string;
  }
}

/**
 * Hono context of every route: the bindings and, once authenticated, the GitHub identity, what
 * vouched for it (the session cookie, a contributor's CLI token, a local run's development
 * header) and until when that credential holds.
 */
export interface AppEnv {
  Bindings: Env;
  Variables: { githubId: number; login: string; via: "session" | "cli" | "dev"; until: number };
}

/**
 * A local run (tests, `wrangler dev`): `ENVIRONMENT` is `local` **and** the request reached this
 * machine by a loopback name. Only then are the development identity, `/admin` without Access and
 * joining without Turnstile allowed (KL-29); a deployment can never be both.
 */
/** The deployments there are: tests and `wrangler dev`, the public rehearsal, mainnet. */
export const ENVIRONMENTS = ["local", "testnet", "production"] as const;

export const isLocal = (env: Env, url: string): boolean =>
  env.ENVIRONMENT === "local" && LOOPBACK_HOSTS.includes(new URL(url).hostname);

/** Longest edge-cache lifetime of a public read (KL-36): the status must stay near live. */
const MAX_PUBLIC_CACHE_SECONDS = 60;

/** Whether `value` is a verifier URL: https, or plain http to this machine only. */
function isVerifierUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" ||
      (url.protocol === "http:" && LOOPBACK_HOSTS.includes(url.hostname))
    );
  } catch {
    return false;
  }
}

/**
 * What makes this configuration unusable, by setting name (never a value); empty when it is
 * usable. An empty `VERIFIER_URL` is allowed: nothing is dispatched (KL-30).
 */
export function configProblems(env: Env): string[] {
  const problems: string[] = [];
  try {
    asCeremonyId(env.CEREMONY_ID, "CEREMONY_ID");
  } catch {
    problems.push("CEREMONY_ID is not a ceremony id");
  }
  for (const name of ["SESSION_KEY", "VERIFIER_HMAC_KEY"] as const) {
    try {
      keyBytes(env[name], name);
    } catch {
      problems.push(`${name} must be at least ${MIN_KEY_BYTES} bytes`);
    }
  }
  // One secret for both would let the verifier's host mint session and CLI tokens; compared as
  // HMAC uses them, where a trailing zero byte or a long key's digest is the same key.
  if (
    env.SESSION_KEY &&
    env.VERIFIER_HMAC_KEY &&
    hmacKeyForm(env.SESSION_KEY) === hmacKeyForm(env.VERIFIER_HMAC_KEY)
  ) {
    problems.push("SESSION_KEY and VERIFIER_HMAC_KEY must differ");
  }
  // What the deployment is decides local privileges and which network it may run: no other value.
  if (!(ENVIRONMENTS as readonly string[]).includes(env.ENVIRONMENT)) {
    problems.push(`ENVIRONMENT must be one of ${ENVIRONMENTS.join(", ")}`);
  }
  const seconds = env.PUBLIC_CACHE_SECONDS;
  if (!/^[0-9]{1,3}$/.test(seconds ?? "") || Number(seconds) > MAX_PUBLIC_CACHE_SECONDS) {
    problems.push(`PUBLIC_CACHE_SECONDS must be 0–${MAX_PUBLIC_CACHE_SECONDS}`);
  }
  // The operator signing keys come from this origin: never plain http, never another host.
  if (
    env.ACCESS_TEAM_DOMAIN &&
    !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN)
  ) {
    problems.push("ACCESS_TEAM_DOMAIN must be https://<team>.cloudflareaccess.com");
  }
  if (env.VERIFIER_URL && !isVerifierUrl(env.VERIFIER_URL)) {
    problems.push("VERIFIER_URL must be https (plain http only on a loopback host)");
  }
  if (!env.VERIFIER_ACCESS_CLIENT_ID !== !env.VERIFIER_ACCESS_CLIENT_SECRET) {
    problems.push("VERIFIER_ACCESS_CLIENT_ID and VERIFIER_ACCESS_CLIENT_SECRET go together");
  }
  return problems;
}
