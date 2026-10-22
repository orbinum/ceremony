/** Validators for every wire contract: exact fields, canonical hex, bounded text. */
import {
  CIRCUIT_ORDER,
  MAX_CONTRIBUTIONS,
  MAX_DETAIL_CHARS,
  MAX_FILE_BYTES,
  MAX_LOG_CHARS,
  TOOLING,
} from "../../config";
import {
  asClientInfo,
  CONTRIBUTION_METHODS,
  LOCAL_VERIFIER,
  validateFinalRecord,
  validateRecord,
} from "../../ceremony";
import { FormatError } from "../../primitives/errors";
import {
  asArray,
  asDecimalId,
  asHex,
  asObject,
  asOneOf,
  asRecord,
  asSafeInt,
  asString,
  asU32,
  LOG_TEXT,
  normalizeHex,
  PRINTABLE,
  VERSION,
  ZKEY_NAME,
} from "../../primitives/schema";
import { REJECT_REASONS } from "../../verification";
import type { ContributionClaim, FinalizeRequest, JobId, JobSpec, VerifierReport } from "./types";

/** An upload claim from a client; hashes normalized to lowercase. */
export function validateClaim(v: unknown, p = "claim"): ContributionClaim {
  const o = asRecord(v, p, ["inputSha256", "outputSha256", "contributionHash", "method", "client"]);
  return {
    inputSha256: normalizeHex(o.inputSha256, `${p}.inputSha256`, 32),
    outputSha256: normalizeHex(o.outputSha256, `${p}.outputSha256`, 32),
    contributionHash: normalizeHex(o.contributionHash, `${p}.contributionHash`, 64),
    method: asOneOf(o.method, `${p}.method`, CONTRIBUTION_METHODS),
    client: asClientInfo(o.client, `${p}.client`),
  };
}

/** A job id from JSON numbers or route parameters (canonical decimal strings only). */
export function validateJobId(v: Record<string, unknown>, p = "job"): JobId {
  return {
    seq: asDecimalId(v.seq, `${p}.seq`),
    circuit: asOneOf(v.circuit, `${p}.circuit`, CIRCUIT_ORDER),
    attempt: asDecimalId(v.attempt, `${p}.attempt`),
  };
}

function job(v: unknown, p: string): JobId & { index: number } {
  const o = asRecord(v, p, ["seq", "circuit", "attempt", "index"]);
  return {
    seq: asU32(o.seq, `${p}.seq`),
    circuit: asOneOf(o.circuit, `${p}.circuit`, CIRCUIT_ORDER),
    attempt: asU32(o.attempt, `${p}.attempt`),
    index: asU32(o.index, `${p}.index`),
  };
}

/** A dispatched job, as the verifier receives it. */
export function validateJobSpec(v: unknown): JobSpec {
  const o = asRecord(v, "spec", ["job", "claim", "size", "head", "genesisSha256"]);
  const head = asRecord(o.head, "spec.head", ["outputSha256", "csHash", "previous"]);
  const spec: JobSpec = {
    job: job(o.job, "spec.job"),
    claim: validateClaim(o.claim, "spec.claim"),
    size: asSafeInt(o.size, "spec.size", 1, MAX_FILE_BYTES),
    head: {
      outputSha256: asHex(head.outputSha256, "spec.head.outputSha256", 32),
      csHash: asHex(head.csHash, "spec.head.csHash", 64),
      previous: asArray(head.previous, "spec.head.previous", MAX_CONTRIBUTIONS).map((e, i) => {
        const q = `spec.head.previous[${i}]`;
        const r = asRecord(e, q, ["hash", "name", "deltaAfter"]);
        return {
          hash: asHex(r.hash, `${q}.hash`, 64),
          name: asString(r.name, `${q}.name`, 64, ZKEY_NAME),
          deltaAfter: asHex(r.deltaAfter, `${q}.deltaAfter`, 64),
        };
      }),
    },
    genesisSha256: asHex(o.genesisSha256, "spec.genesisSha256", 32),
  };
  if (spec.job.index !== spec.head.previous.length + 1) {
    throw new FormatError("spec.job.index: does not follow the head");
  }
  return spec;
}

/** A verifier callback: exact fields per result, canonical hex, bounded text. */
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
  const j = job(o.job, "report.job");
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

/**
 * `POST /admin/finalize`, by shape only: a chained beacon record and at most one final record per
 * circuit. `checkFinalize` holds them against the ceremony.
 */
export function validateFinalizeRequest(v: unknown): FinalizeRequest {
  const o = asRecord(v, "finalize", ["beacon", "finals"]);
  const { prev_chain, chain, ...record } = asObject(o.beacon, "finalize.beacon");
  const beacon = validateRecord(record, "finalize.beacon");
  if (beacon.type !== "beacon") throw new FormatError("finalize.beacon: not a beacon record");
  const finals = asArray(o.finals, "finalize.finals", CIRCUIT_ORDER.length, 1).map((f, i) =>
    validateFinalRecord(f, `finalize.finals[${i}]`),
  );
  if (new Set(finals.map((f) => f.circuit)).size !== finals.length) {
    throw new FormatError("finalize.finals: a circuit appears twice");
  }
  return {
    beacon: {
      ...beacon,
      prev_chain: asHex(prev_chain, "finalize.beacon.prev_chain", 32),
      chain: asHex(chain, "finalize.beacon.chain", 32),
    },
    finals,
  };
}

/**
 * A service verifier's version: never the CLI's local marker, which would make the record a
 * simulated contribution and withhold the transcript of a real ceremony for good.
 */
function verifierVersion(value: unknown): string {
  const v = asString(value, "report.verifierVersion", 32, VERSION);
  if (v === LOCAL_VERIFIER) throw new FormatError("report.verifierVersion: the local marker");
  return v;
}

/** `POST /admin/unhold`: the GitHub id whose hold the operator lifts. */
export function validateUnholdRequest(v: unknown): { githubId: number } {
  const o = asRecord(v, "unhold", ["githubId"]);
  return { githubId: asSafeInt(o.githubId, "unhold.githubId", 1, Number.MAX_SAFE_INTEGER) };
}
