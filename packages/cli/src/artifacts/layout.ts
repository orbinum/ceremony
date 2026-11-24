/**
 * A ceremony directory on disk: core's published layout (SPEC §6.1) joined to `dir`, plus the
 * operator-only `.local` state. Circuit names only come from validated records, so no path here
 * can leave `dir`.
 */
import { join } from "node:path";
import { CEREMONY_LAYOUT as L, type CircuitName } from "@orbinum-ceremony/core";

/** Absolute paths of a ceremony directory's files. */
export const layout = (dir: string) => ({
  announcement: join(dir, L.announcement),
  init: join(dir, L.init),
  transcript: join(dir, L.transcript),
  ptau: join(dir, L.ptau),
  r1cs: (c: CircuitName) => join(dir, L.r1cs(c)),
  /** Index 0 is the genesis. */
  zkey: (c: CircuitName, index: number) => join(dir, L.zkey(c, index)),
  allContributions: join(dir, L.allContributions),
  contributions: (c: CircuitName) => join(dir, L.contributions(c)),
  log: (c: CircuitName, index: number) => join(dir, L.log(c, index)),
  final: join(dir, L.final),
  finalZkey: (c: CircuitName) => join(dir, L.finalZkey(c)),
  finalVk: (c: CircuitName) => join(dir, L.finalVk(c)),
  /** Operator-only state, never published: lock and local measurements. */
  local: join(dir, ".local"),
  lock: join(dir, ".local", "lock"),
  metrics: join(dir, ".local", "metrics.json"),
});
