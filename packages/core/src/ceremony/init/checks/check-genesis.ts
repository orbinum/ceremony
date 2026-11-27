/** A genesis has no MPC entry: anything else was not produced by `groth16 setup`. */
import type { MpcParams } from "../../../formats";

export const checkGenesis = (params: MpcParams): string[] =>
  params.entries.length === 0 ? [] : [`genesis has ${params.entries.length} MPC entries`];
