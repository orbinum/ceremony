/** The verifier's own operator-only record of one attempt: the job, the verdict, timings, the log. */
import type { VerificationResult } from "../../../verification";
import type { JobSpec } from "../types";

export const verifierLogOf = (
  job: JobSpec["job"],
  verdict: VerificationResult,
  ms: Record<string, number | undefined>,
  log: string,
): string => `${JSON.stringify({ job, verdict, ms })}\n${log}\n`;
