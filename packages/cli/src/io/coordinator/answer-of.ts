/**
 * The coordinator's answer, read the same way for every caller: bounded, a non-2xx answer as a
 * `CoordinatorRefusal` (status and core's error code, its text made terminal-safe and cut short),
 * anything else only as a JSON object. `notJson` says what a non-JSON answer likely was instead.
 */
import { asObject, fromUtf8, parseJsonText, stripControl } from "@orbinum-ceremony/core";
import { CoordinatorRefusal } from "./coordinator-refusal";
import { readCapped } from "../read-capped";

const MAX_ANSWER_BYTES = 64 * 1024;
const MAX_ERROR_CHARS = 512;

function codeOf(text: string): string | undefined {
  try {
    const code = (JSON.parse(text) as { error?: { code?: unknown } }).error?.code;
    return typeof code === "string" ? code : undefined;
  } catch {
    return undefined;
  }
}

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
