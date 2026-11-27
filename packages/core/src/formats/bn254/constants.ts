/**
 * BN254 constants: the base field modulus Fq, the scalar field modulus Fr as big-endian hex (as an
 * r1cs header stores the prime), the bytes of one Fq element, and δ·G1 of every genesis:
 * `groth16 setup` starts δ at 1, i.e. the G1 generator (1, 2), uncompressed big-endian.
 */
export const BN254_FQ =
  21888242871839275222246405745257275088696311157297823662689037894645226208583n;

export const BN254_FR = "30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001";

export const FQ_BYTES = 32;

export const G1_GENERATOR = `${"00".repeat(31)}01${"00".repeat(31)}02`;
