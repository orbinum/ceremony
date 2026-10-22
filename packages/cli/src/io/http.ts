/**
 * Small JSON documents over HTTP (drand rounds): bounded in time and in bytes, the bound applied
 * while reading, so a hostile server cannot make us buffer more than it allows.
 */
import { asSafeInt, fromUtf8, parseJsonText } from "@orbinum-ceremony/core";

const TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 64 * 1024;

/** The body of `res`, refused as soon as it passes `maxBytes` (declared or actual). */
export async function readCapped(
  res: Response,
  maxBytes: number,
  what: string,
): Promise<Uint8Array> {
  const declared = res.headers.get("content-length");
  if (
    declared !== null &&
    asSafeInt(Number(declared), `${what} content-length`, 0, Number.MAX_SAFE_INTEGER) > maxBytes
  ) {
    throw new Error(`${what}: response larger than ${maxBytes} bytes`);
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (res.body) {
    for await (const chunk of res.body) {
      size += chunk.length;
      if (size > maxBytes) throw new Error(`${what}: response larger than ${maxBytes} bytes`);
      chunks.push(chunk);
    }
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/**
 * GET a small JSON document; rejects on non-2xx, oversize, invalid UTF-8 or JSON. Redirects are
 * followed: what this fetches (drand rounds) is verified by signature, not by where it came from.
 */
export async function fetchJson(url: string, timeoutMs = TIMEOUT_MS): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (new URL(url).protocol === "https:" && new URL(res.url || url).protocol !== "https:") {
    throw new Error(`${url}: redirected from https to plain http`);
  }
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return parseJsonText(fromUtf8(await readCapped(res, MAX_RESPONSE_BYTES, url)), url);
}
