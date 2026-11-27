/**
 * Uploads one contribution with what it claims in `CLAIM_HEADER` (the hashes, how, and by which
 * client); the coordinator answers 202 and verifies it in the background.
 */
import { type CircuitName, CLAIM_HEADER, CONTRIBUTOR_PATHS } from "@orbinum-ceremony/core";
import { putBytes } from "../http";
import type { UploadClaim } from "../types";

export const uploadContribution = (circuit: CircuitName, output: Uint8Array, claim: UploadClaim) =>
  putBytes<{ ok: true }>(CONTRIBUTOR_PATHS.upload(circuit), output, {
    [CLAIM_HEADER]: JSON.stringify(claim),
  });
