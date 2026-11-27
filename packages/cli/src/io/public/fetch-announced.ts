/** A public artifact the coordinator announced, kept only if it hashes to the announced `sha256`. */
import { sha256Hex } from "@orbinum-ceremony/core";
import { fetchPublic } from "./fetch-public";

export async function fetchAnnounced(
  origin: string,
  path: string,
  sha256: string,
  maxBytes: number,
): Promise<Uint8Array> {
  const bytes = await fetchPublic(origin, path, maxBytes);
  if (sha256Hex(bytes) !== sha256) {
    throw new Error(`GET ${path}: does not match its announced hash`);
  }
  return bytes;
}
