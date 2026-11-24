/**
 * snarkjs in this process, one call per operation. Only `worker.ts` (a child process) runs these
 * on untrusted input; everything else goes through `isolated.ts`. SPEC §2.5, A7.
 */
// oxlint-disable-next-line typescript/triple-slash-reference -- the ambient snarkjs types must reach every package that compiles this module
/// <reference path="./snarkjs-module.d.ts" />
import { randomBytes } from "node:crypto";
// The light entry: this module runs in every snarkjs child (KL-33).
import { logLine, toHex, zkeyVerifyPassed } from "@orbinum-ceremony/core/snarkjs-child";
import { zKey } from "snarkjs";

/** Collects snarkjs log lines so callers can require the success marker and keep the log. */
function captureLogger() {
  const lines: string[] = [];
  const push = (level: string) => (msg: string) => lines.push(logLine(level, msg));
  return {
    lines,
    logger: { debug: push("debug"), info: push("info"), warn: push("warn"), error: push("error") },
  };
}

/** A `zkey verify` result: `ok` only if snarkjs returned true and logged "ZKey Ok!" (core rule). */
export interface VerifyOutcome {
  ok: boolean;
  log: string;
}

const outcome = (returned: boolean, lines: string[]): VerifyOutcome => {
  const log = lines.join("\n");
  return { ok: zkeyVerifyPassed(returned, log), log };
};

/** `snarkjs groth16 setup`: the genesis zkey (δ = 1) for one circuit. */
export async function newGenesisZkey(r1cs: string, ptau: string, out: string): Promise<void> {
  await zKey.newZKey(r1cs, ptau, out);
}

/**
 * `snarkjs zkey contribute`; returns h_k as snarkjs reports it (hex). An empty `entropy` is drawn
 * here, in the process that contributes (a child, when isolated), so the caller never holds it;
 * snarkjs adds 64 bytes of its own from the OS CSPRNG either way (SPEC §2.4).
 */
export async function contribute(
  input: string,
  output: string,
  name: string,
  entropy: string,
): Promise<string> {
  const e = entropy || randomBytes(32).toString("hex");
  return toHex(await zKey.contribute(input, output, name, e));
}

/** `snarkjs zkey beacon`: the final, public-randomness step (SPEC §2.6). */
export async function applyBeacon(
  input: string,
  output: string,
  name: string,
  beaconHex: string,
  iterationsExp: number,
): Promise<void> {
  const result = await zKey.beacon(input, output, name, beaconHex, iterationsExp);
  if (!result) throw new Error("snarkjs refused the beacon parameters");
}

/** `snarkjs zkey export verificationkey`, as plain JSON (snarkjs's own vk.json format). */
export const exportVerificationKey = (zkey: string): Promise<Record<string, unknown>> =>
  zKey.exportVerificationKey(zkey);

/** `zkey verify` from r1cs + ptau, with the pass rule of `VerifyOutcome`. */
export async function verifyFromR1cs(r1cs: string, ptau: string, zkey: string) {
  const { lines, logger } = captureLogger();
  return outcome(await zKey.verifyFromR1cs(r1cs, ptau, zkey, logger), lines);
}

/** `zkey verifyfrominit`: same checks, starting from the genesis zkey instead of the r1cs. */
export async function verifyFromInit(genesis: string, ptau: string, zkey: string) {
  const { lines, logger } = captureLogger();
  return outcome(await zKey.verifyFromInit(genesis, ptau, zkey, logger), lines);
}

/** snarkjs caches its curve on `globalThis` with worker threads that keep the process alive. */
export async function releaseSnarkjs(): Promise<void> {
  const cached = (globalThis as { curve_bn128?: { terminate(): Promise<void> } }).curve_bn128;
  await cached?.terminate();
}
