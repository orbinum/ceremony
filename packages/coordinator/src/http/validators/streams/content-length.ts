/** The declared length of a streamed body within `[1, max]`; null if missing or out of range. */
import { asSafeInt } from "@orbinum-ceremony/core";
import type { Context } from "hono";

export function contentLength(c: Context, max: number): number | null {
  const value = c.req.header("content-length");
  if (!value || !/^[0-9]{1,16}$/.test(value)) return null;
  try {
    return asSafeInt(Number(value), "content-length", 1, max);
  } catch {
    return null;
  }
}
