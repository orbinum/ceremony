/**
 * A large file from the first mirror that answers: bounded in size (declared and actual) and time,
 * written to a fresh `.partial` and renamed on success; returns the mirror's URL. Redirects are
 * followed one hop at a time, each allowed by `redirectRefusal`, and a hop to https connects only
 * to public addresses, whatever its name resolves to (the first URL is the user's own). A leftover
 * `.partial`, or a link planted there, is removed first and the file created exclusively. What is
 * downloaded is checked against its pin by the caller.
 */
import { rename, rm } from "node:fs/promises";
import { cappedToFile } from "@orbinum-ceremony/verifier";
import { Agent, fetch as undiciFetch } from "undici";
import { publicOnlyLookup } from "./public-only-lookup";
import { redirectRefusal } from "./redirect-refusal";

const TIMEOUT_MS = 30 * 60 * 1000;
const MAX_REDIRECTS = 5;

const PUBLIC_ONLY = new Agent({ connect: { lookup: publicOnlyLookup() } });

async function fetchFollowing(url: string, signal: AbortSignal) {
  let current = new URL(url);
  for (let hop = 0; ; hop++) {
    const guarded = hop > 0 && current.protocol === "https:";
    const res = await undiciFetch(current, {
      redirect: "manual",
      signal,
      ...(guarded ? { dispatcher: PUBLIC_ONLY } : {}),
    });
    const location = res.headers.get("location");
    if (res.status < 300 || res.status >= 400 || location === null) return res;
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

export async function downloadFirst(
  urls: readonly string[],
  dest: string,
  maxBytes: number,
): Promise<string> {
  const errors: string[] = [];
  for (const url of urls) {
    try {
      await downloadTo(url, dest, maxBytes);
      return url;
    } catch (error) {
      errors.push(`${url}: ${(error as Error).message}`);
    }
  }
  throw new Error(`all mirrors failed:\n  ${errors.join("\n  ")}`);
}
