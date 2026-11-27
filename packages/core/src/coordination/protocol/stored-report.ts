/** A verifier report as a job keeps it: everything but the log. */
import type { StoredReport, VerifierReport } from "./types";

export function storedReport(report: VerifierReport): StoredReport {
  if (report.result !== "valid") return report;
  const { log: _log, ...kept } = report;
  return kept;
}
