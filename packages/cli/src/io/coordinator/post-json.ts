/** Posts `value` as JSON to an admin path; the caller makes sure the call is idempotent. */
import { adminCall } from "./admin-call";

export const postJson = (origin: string, path: string, value: unknown) =>
  adminCall(origin, "POST", path, { "content-type": "application/json" }, JSON.stringify(value));
