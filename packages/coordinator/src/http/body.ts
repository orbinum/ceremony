/**
 * Request bodies bounded before they are read, and the declared length of a streamed body.
 * COORDINATOR §3.
 */
import { asSafeInt } from "@orbinum-ceremony/core";
import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { fail } from "./errors";

/** Refuses a body larger than `maxSize` (declared or streamed) before a handler reads it. */
export const limitBody = (maxSize: number) =>
  bodyLimit({ maxSize, onError: (c) => fail(c, "too-large", `body larger than ${maxSize} bytes`) });

/** The declared length of a streamed body within `[1, max]`; null if missing or out of range. */
export function contentLength(c: Context, max: number): number | null {
  const value = c.req.header("content-length");
  if (!value || !/^[0-9]{1,16}$/.test(value)) return null;
  try {
    return asSafeInt(Number(value), "content-length", 1, max);
  } catch {
    return null;
  }
}
