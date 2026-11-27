/** The fields of a Circom `.r1cs` header; `prime` is the scalar field modulus, big-endian hex. */
export interface R1csHeader {
  prime: string;
  wires: number;
  publicOutputs: number;
  publicInputs: number;
  privateInputs: number;
  labels: number;
  constraints: number;
}
