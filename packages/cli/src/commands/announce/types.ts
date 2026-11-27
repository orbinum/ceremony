/** What the operator decides for the announcement. `admission` undefined: open, nobody invited. */
import type { Admission, Network } from "@orbinum-ceremony/core";

export interface AnnounceOptions {
  dir: string;
  network: Network;
  circuitsRepo: string;
  circuitsTag: string;
  circuitsUrl: string;
  minContributions: number;
  open: Date;
  close: Date;
  beaconDelaySeconds: number;
  admission?: Admission;
  force: boolean;
}
