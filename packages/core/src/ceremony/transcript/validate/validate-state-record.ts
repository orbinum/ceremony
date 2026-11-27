/** Strict schema of a lifecycle transition record: known states and a bounded printable reason. */
import {
  asCeremonyId,
  asIsoTime,
  asOneOf,
  asRecord,
  asString,
  NONEMPTY_PRINTABLE,
} from "../../../primitives/schema";
import { CEREMONY_STATES } from "../../lifecycle";
import type { StateRecord } from "../types";

export function validateStateRecord(v: unknown, p: string): StateRecord {
  const o = asRecord(v, p, ["type", "ceremony_id", "from", "to", "at", "reason"]);
  return {
    type: "state",
    ceremony_id: asCeremonyId(o.ceremony_id, `${p}.ceremony_id`),
    from: asOneOf(o.from, `${p}.from`, CEREMONY_STATES),
    to: asOneOf(o.to, `${p}.to`, CEREMONY_STATES),
    at: asIsoTime(o.at, `${p}.at`),
    reason: asString(o.reason, `${p}.reason`, 200, NONEMPTY_PRINTABLE),
  };
}
