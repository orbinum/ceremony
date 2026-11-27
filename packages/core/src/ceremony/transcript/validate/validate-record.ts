/** Validates one transcript record of any type, by the strict schema of its `type`. */
import { asObject, asOneOf } from "../../../primitives/schema";
import type { TranscriptRecord } from "../types";
import { validateAttestationRecord } from "./validate-attestation-record";
import { validateBeaconRecord } from "./validate-beacon-record";
import { validateContributionRecord } from "./validate-contribution-record";
import { validateStateRecord } from "./validate-state-record";

const BY_TYPE = {
  contribution: validateContributionRecord,
  attestation: validateAttestationRecord,
  state: validateStateRecord,
  beacon: validateBeaconRecord,
} as const;

export function validateRecord(v: unknown, p = "record"): TranscriptRecord {
  const type = asOneOf(
    asObject(v, p).type,
    `${p}.type`,
    Object.keys(BY_TYPE) as (keyof typeof BY_TYPE)[],
  );
  return BY_TYPE[type](v, p);
}
