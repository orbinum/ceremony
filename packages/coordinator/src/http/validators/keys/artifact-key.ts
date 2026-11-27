/**
 * The key under `/artifacts/` (this ceremony's public folder); any other path, or one with a
 * malformed escape, is not found.
 */
import { validator } from "hono/validator";
import { fail } from "../../answers";
import { folderKey } from "./folder-key";

export const artifactKey = validator("param", (_, c) => {
  try {
    const path = new URL(c.req.url).pathname.replace(/^\/artifacts\//, "");
    const key = folderKey(decodeURIComponent(path));
    if (key) return { key };
  } catch {}
  return fail(c, "not-found", "no such artifact");
});
