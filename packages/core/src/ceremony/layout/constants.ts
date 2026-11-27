/**
 * The published ceremony directory: one set of relative POSIX keys, used for files on disk (cli),
 * objects in the public bucket (coordinator) and inputs on the VPS (verifier). Zkey index 0 is the
 * genesis; a circuit's accepted contributions are `1.zkey` … `k.zkey` under its own directory; the
 * final keys and verification keys sit together under `final/`, written by `finalize`.
 */
import { type CircuitName, PTAU } from "../../config";

export const CEREMONY_LAYOUT = {
  announcement: "ceremony.json",
  init: "genesis/init.json",
  transcript: "transcript.json",
  status: "status.json",
  ptau: `ptau/${PTAU.file}`,
  r1cs: (c: CircuitName) => `r1cs/${c}.r1cs`,
  zkey: (c: CircuitName, index: number) =>
    index === 0 ? `genesis/${c}.genesis.zkey` : `contributions/${c}/${index}.zkey`,
  allContributions: "contributions",
  contributions: (c: CircuitName) => `contributions/${c}`,
  log: (c: CircuitName, index: number) => `logs/${c}/${index}.log`,
  final: "final",
  finalZkey: (c: CircuitName) => `final/${c}.final.zkey`,
  finalVk: (c: CircuitName) => `final/${c}.vk.json`,
} as const;
