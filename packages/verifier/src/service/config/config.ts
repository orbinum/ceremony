/** The verifier service's settings, validated once from the environment (COORDINATOR §5). */
import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import { join, resolve } from "node:path";
import { checkHmacKey, LOOPBACK_HOSTS, VERIFIER_TIMEOUT_MS, VERSION } from "@orbinum-ceremony/core";

/** The verifier service's settings (COORDINATOR §5). */
export interface ServiceConfig {
  /** The coordinator's origin, where `/internal/objects` and `/internal/verifications` live. */
  coordinatorUrl: string;
  /** Shared with the coordinator; authenticates both directions. */
  hmacKey: string;
  /** The address to listen on: an IP literal or `localhost` (default 127.0.0.1). */
  host: string;
  port: number;
  /** Laid out by `init`: `genesis/init.json`, `genesis/<c>.genesis.zkey`. */
  ceremonyDir: string;
  ptau: string;
  /** One record per attempt, at `<logDir>/<attemptLogKey(job)>`. */
  logDir: string;
  /** snarkjs time bound per upload, within `VERIFIER_TIMEOUT_MS`. */
  timeoutMs: number;
  /** This package's version, carried by every accepted record (`verified_by.verifier_version`). */
  version: string;
}

/** The package manifest, the single source of the service's version. */
const MANIFEST = new URL("../../../package.json", import.meta.url);

/** The version in this package's manifest; throws unless it is a valid version string. */
function packageVersion(): string {
  const { version } = JSON.parse(readFileSync(MANIFEST, "utf8")) as { version?: unknown };
  if (typeof version !== "string" || !VERSION.test(version)) {
    throw new Error("package.json: version missing or invalid");
  }
  return version;
}

/** The coordinator's origin: `https:` (`http:` on loopback); no credentials, path, query, hash. */
function coordinatorOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("COORDINATOR_URL: not a URL");
  }
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && LOOPBACK_HOSTS.includes(url.hostname))
  ) {
    throw new Error("COORDINATOR_URL: must be https: (http: only on a loopback host)");
  }
  if (url.username || url.password) throw new Error("COORDINATOR_URL: may not carry credentials");
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("COORDINATOR_URL: must be an origin, without path, query or hash");
  }
  return url.origin;
}

/**
 * The listen address: an IP literal or `localhost`. Empty is refused, since `listen` would read it
 * as every interface.
 */
function listenHost(value: string): string {
  if (isIP(value) === 0 && value !== "localhost") {
    throw new Error("HOST: must be an IP address or localhost");
  }
  return value;
}

/** A decimal integer in `[min, max]`, or the error naming `name`. */
function integerIn(name: string, value: string, min: number, max: number): number {
  const n = /^\d{1,16}$/.test(value) ? Number(value) : Number.NaN;
  if (!(n >= min && n <= max)) throw new Error(`${name}: must be an integer in [${min}, ${max}]`);
  return n;
}

/**
 * Reads the configuration; throws listing every missing or invalid variable by name, never its
 * value.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServiceConfig {
  const required = ["COORDINATOR_URL", "VERIFIER_HMAC_KEY", "CEREMONY_DIR", "PTAU"] as const;
  const missing = required.filter((k) => !env[k]);
  if (missing.length > 0) throw new Error(`missing environment: ${missing.join(", ")}`);
  const problems: string[] = [];
  const check = <T>(fn: () => T): T | undefined => {
    try {
      return fn();
    } catch (error) {
      problems.push((error as Error).message);
      return undefined;
    }
  };
  const coordinatorUrl = check(() => coordinatorOrigin(env.COORDINATOR_URL as string));
  try {
    checkHmacKey(env.VERIFIER_HMAC_KEY as string);
  } catch (error) {
    problems.push(`VERIFIER_HMAC_KEY: ${(error as Error).message}`);
  }
  const host = check(() => listenHost(env.HOST ?? "127.0.0.1"));
  const port = check(() => integerIn("PORT", env.PORT ?? "8788", 1, 65_535));
  const timeoutMs = check(() =>
    integerIn(
      "VERIFY_TIMEOUT_MS",
      env.VERIFY_TIMEOUT_MS ?? String(VERIFIER_TIMEOUT_MS.max),
      VERIFIER_TIMEOUT_MS.min,
      VERIFIER_TIMEOUT_MS.max,
    ),
  );
  const version = check(packageVersion);
  if (problems.length > 0) throw new Error(`invalid environment: ${problems.join("; ")}`);
  const ceremonyDir = resolve(env.CEREMONY_DIR as string);
  return {
    coordinatorUrl: coordinatorUrl as string,
    hmacKey: env.VERIFIER_HMAC_KEY as string,
    host: host as string,
    port: port as number,
    ceremonyDir,
    ptau: resolve(env.PTAU as string),
    logDir: resolve(env.LOG_DIR || join(ceremonyDir, "logs")),
    timeoutMs: timeoutMs as number,
    version: version as string,
  };
}
