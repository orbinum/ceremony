/** Reused Phase 1: Hermez / Polygon zkEVM Powers of Tau. SPEC §1. */
export const PTAU = {
  file: "powersOfTau28_hez_final_16.ptau",
  power: 16,
  maxConstraints: 2 ** 16,
  sizeBytes: 75_580_568,
  blake2b512:
    "6a6277a2f74e1073601b4f9fed6e1e55226917efb0f0db8a07d98ab01df1ccf43eb0e8c3159432acd4960e2f29fe84a4198501fa54c8dad9e43297453efec125",
  // Any host is safe: the file is checked against `blake2b512`. Orbinum's own copies first: every
  // deployed coordinator serves the ptau its setup pins, and ceremony-verifier's test-vectors
  // release carries it. The original Hermez hosts (403 since September 2026) stay last, in case
  // they come back.
  mirrors: [
    "https://ceremony.testnet.orbinum.network/artifacts/ptau/powersOfTau28_hez_final_16.ptau",
    "https://github.com/orbinum/ceremony-verifier/releases/download/test-vectors-2/powersOfTau28_hez_final_16.ptau",
    "https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_16.ptau",
    "https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_16.ptau",
  ],
} as const;
