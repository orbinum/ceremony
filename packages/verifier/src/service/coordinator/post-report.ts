/**
 * Posts a verification result to the coordinator. Network errors, 5xx and 429 are retried until
 * the deadline (the callback is idempotent); any other 4xx is final: the coordinator refused the
 * report itself, and repeating it would not change that.
 */
import { INTERNAL_PATHS, type VerifierReport } from "@orbinum-ceremony/core";
import { refusalError } from "./refusal-error";
import { retriedRequest } from "./retried-request";
import type { Endpoint } from "./types";

export async function postReport(
  ep: Endpoint,
  report: VerifierReport,
  signal?: AbortSignal,
): Promise<void> {
  const body = JSON.stringify(report);
  const response = await retriedRequest(ep, "POST", INTERNAL_PATHS.verifications, body, signal);
  if (!response.ok) throw await refusalError("report", response);
  await response.body?.cancel();
}
