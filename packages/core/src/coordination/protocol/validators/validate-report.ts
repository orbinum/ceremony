/**
 * A verifier callback: exact fields per result, canonical hex, bounded text. A service verifier's
 * version may never be the CLI's local marker, which would make the record a simulated
 * contribution and withhold the transcript of a real ceremony for good.
 */
import { MAX_DETAIL_CHARS, MAX_LOG_CHARS, TOOLING } from "../../../config";
import { LOCAL_VERIFIER } from "../../../ceremony";
import { FormatError } from "../../../primitives/errors";
import {
  asHex,
  asObject,
  asOneOf,
  asRecord,
  asString,
  LOG_TEXT,
  normalizeHex,
  PRINTABLE,
  VERSION,
  ZKEY_NAME,
} from "../../../primitives/schema";
import { REJECT_REASONS } from "../../../verification";
import type { VerifierReport } from "../types";
import { validateIndexedJob } from "./validate-indexed-job";

export function validateReport(v: unknown): VerifierReport {
  const o0 = asObject(v, "report");
  const result = asOneOf(o0.result, "report.result", [
    "valid",
    "rejected",
    "ambiguous",
    "infra",
  ] as const);
  const hasDetail = Object.hasOwn(o0, "detail");
  const keys = {
    valid: [
      "contributionHash",
      "zkeyName",
      "deltaAfter",
      "logSha256",
      "log",
      "verifierVersion",
      "snarkjsVersion",
    ],
    rejected: hasDetail ? ["reason", "detail"] : ["reason"],
    ambiguous: ["detail"],
    infra: ["detail"],
  }[result];
  const o = asRecord(v, "report", ["job", "result", ...keys]);
  const j = validateIndexedJob(o.job, "report.job");
  const detail = () => asString(o.detail, "report.detail", MAX_DETAIL_CHARS, PRINTABLE);
  switch (result) {
    case "valid":
      return {
        job: j,
        result,
        contributionHash: normalizeHex(o.contributionHash, "report.contributionHash", 64),
        zkeyName: asString(o.zkeyName, "report.zkeyName", 64, ZKEY_NAME),
        deltaAfter: asHex(o.deltaAfter, "report.deltaAfter", 64),
        logSha256: normalizeHex(o.logSha256, "report.logSha256", 32),
        log: asString(o.log, "report.log", MAX_LOG_CHARS, LOG_TEXT),
        verifierVersion: verifierVersion(o.verifierVersion),
        snarkjsVersion: asOneOf(o.snarkjsVersion, "report.snarkjsVersion", [TOOLING.snarkjs]),
      };
    case "rejected":
      return {
        job: j,
        result,
        reason: asOneOf(o.reason, "report.reason", REJECT_REASONS),
        ...(hasDetail ? { detail: detail() } : {}),
      };
    default:
      return { job: j, result, detail: detail() };
  }
}

function verifierVersion(value: unknown): string {
  const v = asString(value, "report.verifierVersion", 32, VERSION);
  if (v === LOCAL_VERIFIER) throw new FormatError("report.verifierVersion: the local marker");
  return v;
}
