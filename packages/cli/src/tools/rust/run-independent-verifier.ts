/**
 * Runs the independent Rust verifier (arkworks, no snarkjs code) on private staged copies and reads
 * its JSON verdict with core. Exit 1 means "checks failed" and still carries a verdict; any other
 * failure is an error. The verdict must carry exactly the expected checks, so a binary that skips
 * one never passes. `source` is the pinned r1cs and ptau: the genesis must be what snarkjs derives
 * from them.
 */
import {
  type IndependentVerdict,
  parseJsonText,
  readIndependentVerdict,
} from "@orbinum-ceremony/core";
import { redact } from "../../io";
import { howItEnded, runTool } from "../process";

export interface IndependentInputs {
  genesis: string;
  final: string;
  minContributions: number;
  beacon: { randomness: string; iterationsExp: number };
  source: { r1cs: string; ptau: string };
}

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
