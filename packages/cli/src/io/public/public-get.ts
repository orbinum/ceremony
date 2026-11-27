/** `GET <origin><path>` of a public coordinator file: no credentials, no redirect, at most `maxBytes`. */
import { readCapped } from "../read-capped";

export async function publicGet(
  origin: string,
  path: string,
  maxBytes: number,
  timeoutMs: number,
): Promise<Uint8Array> {
  const what = `GET ${path}`;
  const res = await fetch(`${origin}${path}`, {
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${what}: HTTP ${res.status}`);
  return readCapped(res, maxBytes, what);
}
