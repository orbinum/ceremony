/**
 * The first drand round emitted at or after a Unix time: how the announced beacon round is derived
 * from the schedule, so the operator never chooses it.
 */
import { DRAND } from "../../config";

export function roundAt(unixSeconds: number): number {
  if (unixSeconds <= DRAND.genesisTime) return 1;
  return Math.ceil((unixSeconds - DRAND.genesisTime) / DRAND.periodSeconds) + 1;
}
