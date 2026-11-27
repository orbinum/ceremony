/**
 * A ceremony directory on disk: core's published layout joined to `dir`, plus the operator-only
 * `.local` state (lock and local measurements, never published). Circuit names only come from
 * validated records, so no path here can leave `dir`. `zkey(c, 0)` is the genesis.
 */
import { join } from "node:path";
import { CEREMONY_LAYOUT as L, type CircuitName } from "@orbinum-ceremony/core";

export const layout = (dir: string) => ({
  announcement: join(dir, L.announcement),
  init: join(dir, L.init),
  transcript: join(dir, L.transcript),
  ptau: join(dir, L.ptau),
  r1cs: (c: CircuitName) => join(dir, L.r1cs(c)),
  zkey: (c: CircuitName, index: number) => join(dir, L.zkey(c, index)),
  allContributions: join(dir, L.allContributions),
  contributions: (c: CircuitName) => join(dir, L.contributions(c)),
  log: (c: CircuitName, index: number) => join(dir, L.log(c, index)),
  final: join(dir, L.final),
  finalZkey: (c: CircuitName) => join(dir, L.finalZkey(c)),
  finalVk: (c: CircuitName) => join(dir, L.finalVk(c)),
  local: join(dir, ".local"),
  lock: join(dir, ".local", "lock"),
  metrics: join(dir, ".local", "metrics.json"),
});
