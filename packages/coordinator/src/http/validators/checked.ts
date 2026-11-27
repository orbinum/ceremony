/**
 * Wraps a validator's parse: any throw becomes a `400 malformed` answer, with a `Malformed` error's
 * own message and nothing of any other error.
 */
import type { Context } from "hono";
import { fail } from "../answers";
import { Malformed } from "./malformed";

export const checked =
  <V, T>(parse: (value: V, c: Context) => T) =>
  (value: V, c: Context): T | Response => {
    try {
      return parse(value, c);
    } catch (error) {
      return fail(c, "malformed", error instanceof Malformed ? error.message : "malformed");
    }
  };
