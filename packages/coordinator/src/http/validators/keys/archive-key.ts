/**
 * `/archive/<ceremony_id>/<key>`: a ceremony and a key of its public folder. Anything else,
 * including a malformed escape or ceremony id, is not found.
 */
import { asCeremonyId } from "@orbinum-ceremony/core";
import { validator } from "hono/validator";
import { fail } from "../../answers";
import { folderKey } from "./folder-key";

export const archiveKey = validator("param", (_, c) => {
  try {
    const path = new URL(c.req.url).pathname.replace(/^\/archive\//, "");
    const slash = path.indexOf("/");
    const id = decodeURIComponent(path.slice(0, slash));
    const key = folderKey(decodeURIComponent(path.slice(slash + 1)));
    if (slash > 0 && key && asCeremonyId(id, "ceremony") === id) return { ceremonyId: id, key };
  } catch {}
  return fail(c, "not-found", "no such artifact");
});
