/** Unix time (s) at which a drand round is emitted: rounds start at 1 on the chain's genesis. */
import { DRAND } from "../../config";

export const roundTime = (round: number): number =>
  DRAND.genesisTime + (round - 1) * DRAND.periodSeconds;
