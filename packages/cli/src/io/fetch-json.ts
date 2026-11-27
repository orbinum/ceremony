/**
 * A small JSON document over HTTP (a drand round), bounded in time and bytes; rejects on non-2xx,
 * oversize, invalid UTF-8 or JSON. Redirects are followed (but never from https down to http):
 * what this fetches is verified by signature, not by where it came from.
 */
import { fromUtf8, parseJsonText } from "@orbinum-ceremony/core";
import { readCapped } from "./read-capped";

const TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 64 * 1024;

export async function fetchJson(url: string, timeoutMs = TIMEOUT_MS): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (new URL(url).protocol === "https:" && new URL(res.url || url).protocol !== "https:") {
    throw new Error(`${url}: redirected from https to plain http`);
  }
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return parseJsonText(fromUtf8(await readCapped(res, MAX_RESPONSE_BYTES, url)), url);
}
