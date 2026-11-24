/**
 * The coordinator's answers, read the same way for every caller: bounded, a non-2xx answer as a
 * `CoordinatorRefusal` (its status and core's error code), anything else only as a JSON object.
 * Public reads go without credentials and never through a redirect.
 */
import { asObject, fromUtf8, parseJsonText, stripControl } from "@orbinum-ceremony/core";
import { readCapped } from "./http";

const MAX_ANSWER_BYTES = 64 * 1024;
const MAX_ERROR_CHARS = 512;

/** A refusal answered by the coordinator: its HTTP status and error code (core's codes). */
export class CoordinatorRefusal extends Error {
  override readonly name = "CoordinatorRefusal";
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | undefined,
  ) {
    super(message);
  }
}

function codeOf(text: string): string | undefined {
  try {
    const code = (JSON.parse(text) as { error?: { code?: unknown } }).error?.code;
    return typeof code === "string" ? code : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The JSON object `res` answers to `what`; a refusal for a non-2xx answer, an error for one that
 * is not JSON (`notJson` says what it likely was instead).
 */
export async function answerOf(
  res: Response,
  what: string,
  notJson = "not a JSON answer",
): Promise<Record<string, unknown>> {
  const text = fromUtf8(await readCapped(res, MAX_ANSWER_BYTES, what));
  if (!res.ok) {
    const said = stripControl(text).replace(/\s+/g, " ").slice(0, MAX_ERROR_CHARS);
    throw new CoordinatorRefusal(`${what}: ${res.status} ${said}`, res.status, codeOf(text));
  }
  if (!res.headers.get("content-type")?.startsWith("application/json")) {
    throw new Error(`${what}: ${res.status} but ${notJson}`);
  }
  return asObject(parseJsonText(text, what), what);
}

/** `GET <origin><path>` without credentials, never through a redirect, at most `maxBytes`. */
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
