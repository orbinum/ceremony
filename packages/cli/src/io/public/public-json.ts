/** A public document the coordinator serves (no credentials, no redirect), parsed as JSON. */
import { fromUtf8, parseJsonText } from "@orbinum-ceremony/core";
import { ADMIN_TIMEOUT_MS } from "../constants";
import { publicGet } from "./public-get";

export async function publicJson(origin: string, path: string, maxBytes: number): Promise<unknown> {
  const bytes = await publicGet(origin, path, maxBytes, ADMIN_TIMEOUT_MS);
  return parseJsonText(fromUtf8(bytes), `GET ${path}`);
}
