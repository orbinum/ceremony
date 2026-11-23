/**
 * The coordinator's contributor API as a CLI drives it (SPEC §4.4), with a CLI token: only to the
 * configured origin and only on the fixed contributor paths, never through a redirect (which
 * would carry the token elsewhere), every answer bounded. The public artifacts it downloads go
 * without the token and are kept only if they hash to what the coordinator announced.
 */
import { asObject, fromUtf8, parseJsonText, sha256Hex, stripControl } from "@orbinum-ceremony/core";
import { readCapped } from "./http";

const TIMEOUT_MS = 60_000;
const DOWNLOAD_TIMEOUT_MS = 30 * 60_000;
const MAX_ANSWER_BYTES = 64 * 1024;
const MAX_ERROR_CHARS = 512;
/** What a head's download path may be: a public artifact, no traversal, nothing else. */
const isArtifactPath = (path: string) =>
  /^\/artifacts\/[A-Za-z0-9._/-]{1,200}$/.test(path) &&
  path
    .split("/")
    .slice(1)
    .every((s) => s !== "" && s !== "." && s !== "..");

/** A refusal answered by the coordinator: its HTTP status and error code (core's codes). */
export class ContributorRefusal extends Error {
  override readonly name = "ContributorRefusal";
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | undefined,
  ) {
    super(message);
  }
}

/** The `error.code` of a refusal body, if it has one. */
function codeOf(text: string): string | undefined {
  try {
    const code = (JSON.parse(text) as { error?: { code?: unknown } }).error?.code;
    return typeof code === "string" ? code : undefined;
  } catch {
    return undefined;
  }
}

/** A contributor's connection: the coordinator's origin and the CLI token. */
export interface Contributor {
  origin: string;
  token: string;
}

/**
 * One call on a contributor path with the CLI token; resolves with the answer's JSON object,
 * rejects with a `ContributorRefusal` for any non-2xx answer.
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
  const what = `${method} ${path}`;
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
  const text = fromUtf8(await readCapped(res, MAX_ANSWER_BYTES, what));
  if (!res.ok) {
    throw new ContributorRefusal(
      `${what}: ${res.status} ${stripControl(text).replace(/\s+/g, " ").slice(0, MAX_ERROR_CHARS)}`,
      res.status,
      codeOf(text),
    );
  }
  if (!res.headers.get("content-type")?.startsWith("application/json")) {
    throw new Error(`${what}: ${res.status} but not a JSON answer`);
  }
  return asObject(parseJsonText(text, what), what);
}

/**
 * A public artifact of the coordinator (`path`): fetched from the same origin without the token,
 * never through a redirect, at most `maxBytes`.
 */
export async function fetchPublic(
  origin: string,
  path: string,
  maxBytes: number,
): Promise<Uint8Array> {
  if (!isArtifactPath(path)) throw new Error("the coordinator announced an unexpected path");
  const what = `GET ${path}`;
  const res = await fetch(`${origin}${path}`, {
    redirect: "error",
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${what}: HTTP ${res.status}`);
  return readCapped(res, maxBytes, what);
}

/**
 * A public artifact the coordinator announced (`path`, `sha256`), fetched as `fetchPublic` does
 * and returned only if it hashes to `sha256`.
 */
export async function fetchAnnounced(
  origin: string,
  path: string,
  sha256: string,
  maxBytes: number,
): Promise<Uint8Array> {
  const bytes = await fetchPublic(origin, path, maxBytes);
  if (sha256Hex(bytes) !== sha256)
    throw new Error(`GET ${path}: does not match its announced hash`);
  return bytes;
}
