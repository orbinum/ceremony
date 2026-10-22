/**
 * Command-line options: one parser for every command, so a bad option is always a usage error
 * (exit 2, with the command's usage) and never a stack trace.
 */
import { resolve } from "node:path";
import { parseArgs, type ParseArgsOptionsConfig } from "node:util";
import { LOOPBACK_HOSTS, normalizeHex } from "@orbinum-ceremony/core";

/** A mistake in how the command was called; the entry point prints the usage and exits 2. */
export class UsageError extends Error {
  override readonly name = "UsageError";
}

/** `parseArgs` in strict mode, its errors as `UsageError`. */
export function parseOptions<T extends ParseArgsOptionsConfig>(argv: string[], options: T) {
  try {
    return parseArgs({ args: argv, options, strict: true, allowPositionals: false }).values;
  } catch (error) {
    throw new UsageError((error as Error).message);
  }
}

/** The value of a required option. */
export function required(value: string | undefined, flag: string): string {
  if (!value) throw new UsageError(`missing --${flag}`);
  return value;
}

/** A path option, absolute. */
export const pathOption = (value: string): string => resolve(value);

/** An optional path option, absolute. */
export const optionalPath = (value: string | undefined): string | undefined =>
  value ? resolve(value) : undefined;

/** A SHA-256 given on the command line (64 hex characters, any case), lowercase. */
export function sha256Option(value: string, flag: string): string {
  try {
    return normalizeHex(value, `--${flag}`, 32);
  } catch {
    throw new UsageError(`--${flag} must be a SHA-256 (64 hex characters)`);
  }
}

/** An integer option within `[min, max]`. */
export function intOption(value: string, flag: string, min: number, max: number): number {
  const n = /^[0-9]{1,16}$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    throw new UsageError(`--${flag} must be an integer from ${min} to ${max}`);
  }
  return n;
}

/**
 * A remote base URL: https, or http to this machine only (a local coordinator or mirror).
 * Returned without a trailing slash, query or fragment.
 */
export function endpointOption(value: string, flag: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new UsageError(`--${flag} is not a URL`);
  }
  const loopback = url.protocol === "http:" && LOOPBACK_HOSTS.includes(url.hostname);
  if (url.protocol !== "https:" && !loopback) {
    throw new UsageError(`--${flag} must be https (http only to localhost)`);
  }
  if (url.username || url.password) throw new UsageError(`--${flag} must not carry credentials`);
  return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
}
