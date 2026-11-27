/**
 * An upload and the pinned inputs it is verified against, and what verifying it yields. Our own
 * inputs (`genesis`, `ptau`, `r1cs`) are pinned by the caller; the pipeline only checks they are
 * present and readable, and missing or unreadable is the host's fault (`infra`), never the
 * contributor's. `zkeyIsOurs` marks an upload this host wrote itself (the service's download):
 * failing to copy it is then `infra` too. With `r1cs`, the full verify from r1cs also runs and
 * must reach the same verdict. `accepted` holds the fields the transcript records for an accepted
 * upload.
 */
import type { VerificationResult } from "@orbinum-ceremony/core";

export interface UploadFiles {
  zkey: string;
  zkeyIsOurs?: boolean;
  genesis: string;
  ptau: string;
  r1cs?: string;
}

export interface UploadVerification {
  verdict: VerificationResult;
  accepted?: { deltaAfter: string; name: string };
  log: string;
  ms: { precheck: number; verify: number; verifyFromR1cs?: number };
}
