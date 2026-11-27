/**
 * Streams the object of a pending job from the coordinator to `dest`, refusing anything but
 * exactly `size` bytes. `false` on 404: the coordinator no longer has it (a stale job), so there
 * is nothing to report.
 */
import { INTERNAL_PATHS, type JobId } from "@orbinum-ceremony/core";
import { cappedToFile } from "../../files";
import { refusalError } from "./refusal-error";
import { retriedRequest } from "./retried-request";
import type { Endpoint } from "./types";

export async function fetchObject(
  ep: Endpoint,
  job: JobId,
  size: number,
  dest: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const response = await retriedRequest(ep, "GET", INTERNAL_PATHS.object(job), "", signal);
  if (response.status === 404) {
    await response.body?.cancel();
    return false;
  }
  if (response.status !== 200 || !response.body) throw await refusalError("object fetch", response);
  if (response.headers.get("content-length") !== String(size)) {
    await response.body.cancel();
    throw new Error("object fetch: unexpected length");
  }
  if ((await cappedToFile(response.body, dest, size)) !== size) {
    throw new Error("object fetch: shorter than declared");
  }
  return true;
}
