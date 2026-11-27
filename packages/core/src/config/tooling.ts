/**
 * Pinned tooling: every component must run exactly these versions. Only the R1CS matters for the
 * setup, and `--O1` is the optimization level the circuits release uses.
 */
export const TOOLING = {
  snarkjs: "0.7.6",
  circom: "2.2.3",
  circomFlags: ["--r1cs", "--O1"],
} as const;
