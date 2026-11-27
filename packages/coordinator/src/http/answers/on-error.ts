/**
 * Unexpected errors: logged in full, answered without internals. A body Hono could not parse
 * (malformed JSON) is the caller's: `malformed`; a failed bucket call is `storage` (retry).
 */
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { StorageError } from "../../storage";
import { fail } from "./fail";

export function onError(error: Error, c: Context) {
  if (error instanceof HTTPException && error.status === 400) return fail(c, "malformed");
  console.error(error);
  if (error instanceof StorageError) return fail(c, "storage", "storage unavailable; try again");
  return fail(c, "internal", "internal error");
}
