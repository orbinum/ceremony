/**
 * What makes a deployment's configuration unusable, by setting name (never a value); empty when it
 * is usable. One key for sessions and verifier MACs would let the verifier's host mint session and
 * CLI tokens, so they must differ as HMAC uses them (a trailing zero byte or a long key's digest is
 * the same key). A `local` environment with a public `COORDINATOR_URL` could freeze an announcement
 * of any network. Operator signing keys come only from an https Access team domain. The verifier
 * container needs this deployment's own https origin. Public reads stay at most a minute in the
 * edge cache. An empty `VERIFIER_URL` is allowed: nothing is dispatched.
 */
import {
  asCeremonyId,
  hmacKeyForm,
  keyBytes,
  LOOPBACK_HOSTS,
  MIN_KEY_BYTES,
} from "@orbinum-ceremony/core";
import { ENVIRONMENTS } from "./constants";

const MAX_PUBLIC_CACHE_SECONDS = 60;

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

const isLoopbackOrigin = (origin: string): boolean => {
  try {
    return LOOPBACK_HOSTS.includes(new URL(origin).hostname);
  } catch {
    return false;
  }
};

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
  if (
    env.SESSION_KEY &&
    env.VERIFIER_HMAC_KEY &&
    hmacKeyForm(env.SESSION_KEY) === hmacKeyForm(env.VERIFIER_HMAC_KEY)
  ) {
    problems.push("SESSION_KEY and VERIFIER_HMAC_KEY must differ");
  }
  if (!(ENVIRONMENTS as readonly string[]).includes(env.ENVIRONMENT)) {
    problems.push(`ENVIRONMENT must be one of ${ENVIRONMENTS.join(", ")}`);
  }
  if (
    env.ENVIRONMENT === "local" &&
    env.COORDINATOR_URL &&
    !isLoopbackOrigin(env.COORDINATOR_URL)
  ) {
    problems.push("ENVIRONMENT local is for a local run: COORDINATOR_URL names a public origin");
  }
  const seconds = env.PUBLIC_CACHE_SECONDS;
  if (!/^[0-9]{1,3}$/.test(seconds ?? "") || Number(seconds) > MAX_PUBLIC_CACHE_SECONDS) {
    problems.push(`PUBLIC_CACHE_SECONDS must be 0–${MAX_PUBLIC_CACHE_SECONDS}`);
  }
  if (
    env.ACCESS_TEAM_DOMAIN &&
    !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN)
  ) {
    problems.push("ACCESS_TEAM_DOMAIN must be https://<team>.cloudflareaccess.com");
  }
  if (env.VERIFIER_URL && !isVerifierUrl(env.VERIFIER_URL)) {
    problems.push("VERIFIER_URL must be https (plain http only on a loopback host)");
  }
  if (
    !env.VERIFIER_URL &&
    env.VERIFIER_CONTAINER &&
    !/^https:\/\/[a-z0-9.-]+$/.test(env.COORDINATOR_URL)
  ) {
    problems.push(
      "COORDINATOR_URL must be this deployment's https origin (the verifier container)",
    );
  }
  if (env.ANNOUNCEMENT_SHA256 && !/^[0-9a-f]{64}$/.test(env.ANNOUNCEMENT_SHA256)) {
    problems.push("ANNOUNCEMENT_SHA256 must be empty or 64 lowercase hex digits");
  }
  if (!env.VERIFIER_ACCESS_CLIENT_ID !== !env.VERIFIER_ACCESS_CLIENT_SECRET) {
    problems.push("VERIFIER_ACCESS_CLIENT_ID and VERIFIER_ACCESS_CLIENT_SECRET go together");
  }
  return problems;
}
