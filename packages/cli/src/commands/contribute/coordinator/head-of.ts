/** `GET /api/session/head/:circuit`, retried and validated. */
import {
  asSafeInt,
  type CircuitName,
  CONTRIBUTOR_PATHS,
  normalizeHex,
} from "@orbinum-ceremony/core";
import { type Contributor, contributorCall } from "../../../io";
import { retrying } from "../retry";
import type { Head } from "./types";

export async function headOf(
  who: Contributor,
  circuit: CircuitName,
  signal?: AbortSignal,
): Promise<Head> {
  const h = await retrying(
    () => contributorCall(who, "GET", CONTRIBUTOR_PATHS.head(circuit), { signal }),
    signal,
  );
  if (typeof h.url !== "string") throw new Error("the head names no download");
  return {
    index: asSafeInt(h.index, "head.index", 0, Number.MAX_SAFE_INTEGER),
    outputSha256: normalizeHex(h.output_sha256, "head.output_sha256", 32),
    url: h.url,
  };
}
