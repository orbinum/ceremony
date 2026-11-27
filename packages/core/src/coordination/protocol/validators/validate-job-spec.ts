/**
 * A dispatched job as the verifier receives it; its index must follow the head it extends and stay
 * within `MAX_CONTRIBUTIONS`.
 */
import { MAX_CONTRIBUTIONS, MAX_FILE_BYTES } from "../../../config";
import { FormatError } from "../../../primitives/errors";
import {
  asArray,
  asHex,
  asRecord,
  asSafeInt,
  asString,
  ZKEY_NAME,
} from "../../../primitives/schema";
import type { JobSpec } from "../types";
import { validateClaim } from "./validate-claim";
import { validateIndexedJob } from "./validate-indexed-job";

export function validateJobSpec(v: unknown): JobSpec {
  const o = asRecord(v, "spec", ["job", "claim", "size", "head", "genesisSha256"]);
  const head = asRecord(o.head, "spec.head", ["outputSha256", "csHash", "previous"]);
  const spec: JobSpec = {
    job: validateIndexedJob(o.job, "spec.job"),
    claim: validateClaim(o.claim, "spec.claim"),
    size: asSafeInt(o.size, "spec.size", 1, MAX_FILE_BYTES),
    head: {
      outputSha256: asHex(head.outputSha256, "spec.head.outputSha256", 32),
      csHash: asHex(head.csHash, "spec.head.csHash", 64),
      previous: asArray(head.previous, "spec.head.previous", MAX_CONTRIBUTIONS - 1).map((e, i) => {
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
