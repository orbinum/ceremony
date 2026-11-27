/** Signs the caller out of this browser; the token itself stays valid until it expires. */
import type { Context } from "hono";
import { deleteCookie } from "hono/cookie";
import { COOKIE_OPTIONS, SESSION_COOKIE } from "./constants";

export const endSession = (c: Context) => deleteCookie(c, SESSION_COOKIE, COOKIE_OPTIONS);
