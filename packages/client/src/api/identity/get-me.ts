/**
 * `GET /api/link`: who is signed in, in which ceremony, and their linked wallet with why it cannot
 * change now (a contribution names it, or it is this account's turn). Null when nobody is.
 */
import { ApiError, call } from "../http";
import type { Me } from "../types";

export async function getMe(): Promise<Me | null> {
  try {
    return await call<Me>("GET", "/api/link");
  } catch (e) {
    if (e instanceof ApiError && e.code === "unauthenticated") return null;
    throw e;
  }
}
