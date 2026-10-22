/**
 * Large files from mirrors: bounded in size (declared and actual) and time, written to a fresh
 * `.partial` and renamed on success. What is downloaded is checked against its pin by the caller.
 */
import { rename, rm } from "node:fs/promises";
// The barrel re-exports this module, so it cannot import from it without a cycle.
import { cappedToFile } from "@orbinum-ceremony/verifier";

const TIMEOUT_MS = 30 * 60 * 1000;

/** A redirect that left https: refused, though every file is pinned, so nothing travels in clear. */
const downgraded = (url: string, res: Response): boolean =>
  new URL(url).protocol === "https:" && new URL(res.url || url).protocol !== "https:";

async function downloadTo(url: string, dest: string, maxBytes: number): Promise<void> {
  const partial = `${dest}.partial`;
  try {
    // A leftover `.partial` (or a link planted there) is removed, then created exclusively.
    await rm(partial, { force: true });
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (downgraded(url, res)) throw new Error("redirected from https to plain http");
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
