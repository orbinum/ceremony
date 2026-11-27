/**
 * A verification check as the report records it: a stable id, how it ended, and a redacted,
 * terminal-safe detail.
 */

export type CheckStatus = "pass" | "fail" | "skip";

export interface Check {
  id: string;
  status: CheckStatus;
  detail?: string;
}
