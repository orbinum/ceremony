/** Pinned tooling: every component must run exactly these versions. SPEC §2.1. */
export const TOOLING = {
  snarkjs: "0.7.6",
  circom: "2.2.3",
  /**
   * Only the R1CS matters for the setup; `--O1` is the optimization level the circuits release
   * uses.
   */
  circomFlags: ["--r1cs", "--O1"],
} as const;
