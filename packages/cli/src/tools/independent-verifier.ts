/**
 * The independent Rust verifier (arkworks, no snarkjs code) and its verdict, read by core. SPEC
 * §8.4.
 */
import {
  type IndependentVerdict,
  parseJsonText,
  readIndependentVerdict,
} from "@orbinum-ceremony/core";
import { redact } from "../io";
import { howItEnded, runTool } from "./process";

/** Its inputs, all private staged copies. */
export interface IndependentInputs {
  genesis: string;
  final: string;
  minContributions: number;
  beacon: { randomness: string; iterationsExp: number };
  /** The pinned r1cs and ptau: the genesis must be what snarkjs derives from them. */
  source: { r1cs: string; ptau: string };
}

/**
 * Runs the verifier and reads its JSON verdict. Exit 1 means "checks failed" and still carries a
 * verdict; any other failure is an error. The verdict must carry exactly the expected checks, so
 * a binary that skips one never passes.
 */
export async function runIndependentVerifier(
  bin: string,
  input: IndependentInputs,
): Promise<IndependentVerdict> {
  const r = await runTool(bin, [
    "--genesis",
    input.genesis,
    "--final",
    input.final,
    "--min-contributions",
    String(input.minContributions),
    "--beacon",
    input.beacon.randomness,
    "--iterations",
    String(input.beacon.iterationsExp),
    "--r1cs",
    input.source.r1cs,
    "--ptau",
    input.source.ptau,
  ]);
  if ((r.code !== 0 && r.code !== 1) || !r.stdout.trim()) {
    const said = r.stderr.trim() ? `: ${redact(r.stderr.trim())}` : "";
    throw new Error(`independent verifier failed (${howItEnded(r)})${said}`);
  }
  return readIndependentVerdict(
    parseJsonText(r.stdout, "independent verifier output"),
    r.code === 0,
  );
}
