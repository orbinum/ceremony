/**
 * `snarkjs zkey contribute` in a child process; returns h_k as snarkjs reports it (hex). An empty
 * `entropy` is drawn in the child, so this process never holds it.
 */
import { callWorker } from "./worker";
import type { LimitsOverride } from "./types";

export const contribute = (
  input: string,
  output: string,
  name: string,
  entropy: string,
  limits?: LimitsOverride,
): Promise<string> => callWorker("contribute", [input, output, name, entropy], limits);
