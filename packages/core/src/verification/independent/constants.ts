/** The check ids the independent Rust verifier must report, every time. */
export const REQUIRED_CHECKS = [
  "well-formed",
  "genesis-start",
  "genesis-source",
  "unchanged",
  "policy",
  "chain",
  "final-delta",
  "scaled-sections",
] as const;
