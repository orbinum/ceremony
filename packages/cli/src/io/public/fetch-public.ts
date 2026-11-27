/**
 * A public artifact of the coordinator, without the token, at most `maxBytes`. The path is the
 * coordinator's word, so it must be a public artifact path with no traversal, nothing else.
 */
import { PUBLIC_DOWNLOAD_TIMEOUT_MS } from "../constants";
import { publicGet } from "./public-get";

const isArtifactPath = (path: string) =>
  /^\/artifacts\/[A-Za-z0-9._/-]{1,200}$/.test(path) &&
  path
    .split("/")
    .slice(1)
    .every((s) => s !== "" && s !== "." && s !== "..");

export function fetchPublic(origin: string, path: string, maxBytes: number): Promise<Uint8Array> {
  if (!isArtifactPath(path)) throw new Error("the coordinator announced an unexpected path");
  return publicGet(origin, path, maxBytes, PUBLIC_DOWNLOAD_TIMEOUT_MS);
}
