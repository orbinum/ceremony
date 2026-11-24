/**
 * The coordinator's contributor API as a CLI drives it (SPEC §4.4), with a CLI token: only to the
 * configured origin and only on the fixed contributor paths, never through a redirect (which
 * would carry the token elsewhere), every answer bounded. The public artifacts it downloads go
 * without the token and are kept only if they hash to what the coordinator announced.
 */
import { sha256Hex } from "@orbinum-ceremony/core";
import { answerOf, publicGet } from "./answer";

const TIMEOUT_MS = 60_000;
const DOWNLOAD_TIMEOUT_MS = 30 * 60_000;

/** What a head's download path may be: a public artifact, no traversal, nothing else. */
const isArtifactPath = (path: string) =>
  /^\/artifacts\/[A-Za-z0-9._/-]{1,200}$/.test(path) &&
  path
    .split("/")
    .slice(1)
    .every((s) => s !== "" && s !== "." && s !== "..");

/** A contributor's connection: the coordinator's origin and the CLI token. */
export interface Contributor {
  origin: string;
  token: string;
}

/**
 * One call on a contributor path with the CLI token; resolves with the answer's JSON object,
 * rejects with a `CoordinatorRefusal` for any non-2xx answer.
 */
export async function contributorCall(
  who: Contributor,
  method: "GET" | "POST" | "PUT",
  path: string,
  init: {
    headers?: Record<string, string>;
    body?: Uint8Array;
    timeoutMs?: number;
    /** Aborts the request (an interrupted run), besides its own timeout. */
    signal?: AbortSignal;
  } = {},
): Promise<Record<string, unknown>> {
  const res = await fetch(`${who.origin}${path}`, {
    method,
    headers: { ...init.headers, authorization: `Bearer ${who.token}` },
    ...(init.body ? { body: init.body } : {}),
    redirect: "error",
    signal: AbortSignal.any([
      AbortSignal.timeout(init.timeoutMs ?? TIMEOUT_MS),
      ...(init.signal ? [init.signal] : []),
    ]),
  });
  return answerOf(res, `${method} ${path}`);
}

/** A public artifact of the coordinator (`path`), at most `maxBytes`. */
export function fetchPublic(origin: string, path: string, maxBytes: number): Promise<Uint8Array> {
  if (!isArtifactPath(path)) throw new Error("the coordinator announced an unexpected path");
  return publicGet(origin, path, maxBytes, DOWNLOAD_TIMEOUT_MS);
}

/**
 * The coordinator's live transcript (`GET /api/transcript`, read from its object, so never behind
 * the commit), at most `maxBytes`.
 */
export const fetchLiveTranscript = (origin: string, maxBytes: number): Promise<Uint8Array> =>
  publicGet(origin, "/api/transcript", maxBytes, DOWNLOAD_TIMEOUT_MS);

/** A public artifact the coordinator announced (`path`), kept only if it hashes to `sha256`. */
export async function fetchAnnounced(
  origin: string,
  path: string,
  sha256: string,
  maxBytes: number,
): Promise<Uint8Array> {
  const bytes = await fetchPublic(origin, path, maxBytes);
  if (sha256Hex(bytes) !== sha256) {
    throw new Error(`GET ${path}: does not match its announced hash`);
  }
  return bytes;
}
