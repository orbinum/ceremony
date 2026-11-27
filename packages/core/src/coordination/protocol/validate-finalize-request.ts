/**
 * `POST /admin/finalize`, by shape only: the beacon `finalize` sealed, chained after the
 * transcript it downloaded, and at most one final record per circuit, bound to that beacon.
 * `checkFinalize` holds them against the ceremony.
 */
import { MAX_CIRCUITS } from "../../config";
import { validateFinalRecord, validateRecord } from "../../ceremony";
import { FormatError } from "../../primitives/errors";
import { asArray, asHex, asObject, asRecord } from "../../primitives/schema";
import type { FinalizeRequest } from "./types";

export function validateFinalizeRequest(v: unknown): FinalizeRequest {
  const o = asRecord(v, "finalize", ["beacon", "finals"]);
  const { prev_chain, chain, ...record } = asObject(o.beacon, "finalize.beacon");
  const beacon = validateRecord(record, "finalize.beacon");
  if (beacon.type !== "beacon") throw new FormatError("finalize.beacon: not a beacon record");
  const finals = asArray(o.finals, "finalize.finals", MAX_CIRCUITS, 1).map((f, i) =>
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
