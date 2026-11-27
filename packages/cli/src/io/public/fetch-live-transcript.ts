/**
 * The coordinator's live transcript (`GET /api/transcript`), at most `maxBytes`: read from its
 * object, so never behind the commit.
 */
import { PUBLIC_DOWNLOAD_TIMEOUT_MS } from "../constants";
import { publicGet } from "./public-get";

export const fetchLiveTranscript = (origin: string, maxBytes: number): Promise<Uint8Array> =>
  publicGet(origin, "/api/transcript", maxBytes, PUBLIC_DOWNLOAD_TIMEOUT_MS);
