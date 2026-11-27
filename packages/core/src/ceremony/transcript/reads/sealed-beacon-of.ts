/** The sealed beacon record, if any (a valid transcript has at most one). */
import type { BeaconRecord, Chained } from "../types";

export const sealedBeaconOf = (records: readonly Chained[]) =>
  records.find((r): r is Chained<BeaconRecord> => r.type === "beacon");
