/** Builds a validated lifecycle transition record. */
import type { CeremonyState } from "../../lifecycle";
import type { StateRecord } from "../types";
import { validateRecord } from "../validate";

export const buildStateRecord = (
  ceremonyId: string,
  change: { from: CeremonyState; to: CeremonyState; reason: string },
  at: string,
): StateRecord =>
  validateRecord({
    type: "state",
    ceremony_id: ceremonyId,
    ...change,
    at,
  } satisfies StateRecord) as StateRecord;
