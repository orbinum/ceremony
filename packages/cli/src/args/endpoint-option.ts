/**
 * A remote base URL: https, or http to this machine only (a local coordinator or mirror), never
 * with credentials. Returned without a trailing slash, query or fragment.
 */
import { LOOPBACK_HOSTS } from "@orbinum-ceremony/core";
import { UsageError } from "./usage-error";

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
