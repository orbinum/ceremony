/**
 * Large files from mirrors: bounded in size (declared and actual) and time, written to a fresh
 * `.partial` and renamed on success. What is downloaded is checked against its pin by the caller.
 */
import { rename, rm } from "node:fs/promises";
import { BlockList, isIP } from "node:net";
import { LOOPBACK_HOSTS } from "@orbinum-ceremony/core";
// The barrel re-exports this module, so it cannot import from it without a cycle.
import { cappedToFile } from "@orbinum-ceremony/verifier";

const TIMEOUT_MS = 30 * 60 * 1000;
/** Redirects followed at most. */
const MAX_REDIRECTS = 5;

/** Private, loopback, link-local and unspecified addresses. */
const INTERNAL = new BlockList();
for (const [net, prefix] of [
  ["10.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
] as const) {
  INTERNAL.addSubnet(net, prefix, "ipv4");
}
INTERNAL.addAddress("0.0.0.0", "ipv4");
INTERNAL.addSubnet("fc00::", 7, "ipv6");
INTERNAL.addSubnet("fe80::", 10, "ipv6");
INTERNAL.addAddress("::1", "ipv6");
INTERNAL.addAddress("::", "ipv6");

/**
 * A host this machine or its network answers for, judged by its spelling alone (no DNS): the
 * name `localhost` (and its subdomains), or an internal IP literal (IPv4-mapped IPv6 included).
 */
function isInternalHost(hostname: string): boolean {
  if (/^(?:.+\.)?localhost\.?$/.test(hostname)) return true;
  const host = hostname.replace(/^\[(.*)\]$/, "$1");
  const family = isIP(host);
  return family !== 0 && INTERNAL.check(host, family === 4 ? "ipv4" : "ipv6");
}

/**
 * Why a redirect from `from` to `to` is not followed, or null. Once on https, no hop may leave it
 * nor point at an internal host (every file is pinned, but a public mirror must not make this
 * machine probe its own network); from plain http (a loopback mirror) a hop goes to https or
 * stays on loopback.
 */
export function redirectRefusal(from: URL, to: URL): string | null {
  if (from.protocol === "https:") {
    if (to.protocol !== "https:") return "redirected from https to plain http";
    if (isInternalHost(to.hostname)) return "redirected from https to an internal host";
    return null;
  }
  if (to.protocol === "https:") return null;
  if (to.protocol === "http:" && LOOPBACK_HOSTS.includes(to.hostname)) return null;
  return "redirected from plain http to neither https nor loopback";
}

/** Follows redirects one hop at a time, each allowed by `redirectRefusal`. */
async function fetchFollowing(url: string, signal: AbortSignal): Promise<Response> {
  let current = new URL(url);
  for (let hop = 0; ; hop++) {
    // oxlint-disable-next-line no-await-in-loop -- one hop after another
    const res = await fetch(current, { redirect: "manual", signal });
    const location = res.headers.get("location");
    if (res.status < 300 || res.status >= 400 || location === null) return res;
    // oxlint-disable-next-line no-await-in-loop -- one hop after another
    await res.body?.cancel();
    if (hop >= MAX_REDIRECTS) throw new Error("too many redirects");
    const next = new URL(location, current);
    const refusal = redirectRefusal(current, next);
    if (refusal !== null) throw new Error(refusal);
    current = next;
  }
}

async function downloadTo(url: string, dest: string, maxBytes: number): Promise<void> {
  const partial = `${dest}.partial`;
  try {
    // A leftover `.partial` (or a link planted there) is removed, then created exclusively.
    await rm(partial, { force: true });
    const res = await fetchFollowing(url, AbortSignal.timeout(TIMEOUT_MS));
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    if (Number(res.headers.get("content-length") ?? 0) > maxBytes) {
      throw new Error(`declares more than ${maxBytes} bytes`);
    }
    await cappedToFile(res.body, partial, maxBytes);
    await rename(partial, dest);
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
}

/** Downloads from the first mirror that answers; returns its URL. */
export async function downloadFirst(
  urls: readonly string[],
  dest: string,
  maxBytes: number,
): Promise<string> {
  const errors: string[] = [];
  for (const url of urls) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- mirrors are tried in order, first success wins
      await downloadTo(url, dest, maxBytes);
      return url;
    } catch (error) {
      errors.push(`${url}: ${(error as Error).message}`);
    }
  }
  throw new Error(`all mirrors failed:\n  ${errors.join("\n  ")}`);
}
