/**
 * `PUT /api/session/upload/:circuit`: the contribution's bytes under its claim, not retried. An
 * upload of the largest key over a slow link gets the same time bound as a download.
 */
import {
  type CircuitName,
  CLAIM_HEADER,
  type ContributionClaim,
  CONTRIBUTOR_PATHS,
} from "@orbinum-ceremony/core";
import { type Contributor, contributorCall } from "../../../io";

const UPLOAD_TIMEOUT_MS = 30 * 60_000;

export async function upload(
  who: Contributor,
  circuit: CircuitName,
  claimed: ContributionClaim,
  bytes: Uint8Array,
  signal?: AbortSignal,
): Promise<void> {
  await contributorCall(who, "PUT", CONTRIBUTOR_PATHS.upload(circuit), {
    headers: {
      [CLAIM_HEADER]: JSON.stringify(claimed),
      "content-type": "application/octet-stream",
    },
    body: bytes,
    timeoutMs: UPLOAD_TIMEOUT_MS,
    signal,
  });
}
