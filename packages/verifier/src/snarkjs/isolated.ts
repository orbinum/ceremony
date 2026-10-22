/**
 * snarkjs, one operation per child process, bounded by `LIMITS` for its class. A limit hit is an
 * `IsolationError`; the operation's own error (a malformed file) is a plain `Error` carrying the
 * child's `code`. Every answer is checked for its operation's shape. KL-33.
 */
import { fileURLToPath } from "node:url";
import { zkeyVerifyPassed } from "@orbinum-ceremony/core";
import { LIMITS, type Limits, runIsolated } from "../isolate";
import type * as inProcess from "./snarkjs";
import type { VerifyOutcome } from "./snarkjs";

const WORKER = fileURLToPath(new URL("./worker.ts", import.meta.url));

type Ops = {
  newGenesisZkey: typeof inProcess.newGenesisZkey;
  contribute: typeof inProcess.contribute;
  applyBeacon: typeof inProcess.applyBeacon;
  exportVerificationKey: typeof inProcess.exportVerificationKey;
  verifyFromR1cs: typeof inProcess.verifyFromR1cs;
  verifyFromInit: typeof inProcess.verifyFromInit;
};

/** One operation and its arguments, as the worker receives it. */
export type SnarkjsTask = {
  [K in keyof Ops]: { op: K; args: Parameters<Ops[K]> };
}[keyof Ops];

const CLASS: Record<keyof Ops, keyof typeof LIMITS> = {
  newGenesisZkey: "heavy",
  verifyFromR1cs: "heavy",
  contribute: "medium",
  applyBeacon: "medium",
  verifyFromInit: "medium",
  exportVerificationKey: "light",
};

const isVoid = (v: unknown): v is void => v === undefined;
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
/** A pass must carry snarkjs's own `ZKey Ok!`: the parent never takes the child's word alone. */
const isVerifyOutcome = (v: unknown): v is VerifyOutcome =>
  isObject(v) &&
  typeof v.log === "string" &&
  (v.ok === false || (v.ok === true && zkeyVerifyPassed(true, v.log)));

/**
 * What each operation must answer (h_k is 64 bytes, as lowercase hex): any other answer is a
 * crash, never a pass.
 */
export const REPLY_CHECKS: { [K in keyof Ops]: (v: unknown) => v is Awaited<ReturnType<Ops[K]>> } =
  {
    newGenesisZkey: isVoid,
    contribute: (v): v is string => typeof v === "string" && /^[0-9a-f]{128}$/.test(v),
    applyBeacon: isVoid,
    exportVerificationKey: isObject,
    verifyFromR1cs: isVerifyOutcome,
    verifyFromInit: isVerifyOutcome,
  };

/** Tighter bounds for one call (e.g. what is left of the service's deadline); never looser. */
export type LimitsOverride = Partial<Limits>;

const lower = (bound: number, override: number | undefined) =>
  override !== undefined && override > 0 ? Math.min(bound, override) : bound;

/** The bounds `op` runs under: its class's, lowered (never raised) by `override`. */
export function limitsFor(op: keyof Ops, override?: LimitsOverride): Limits {
  const bound = LIMITS[CLASS[op]];
  return {
    timeoutMs: lower(bound.timeoutMs, override?.timeoutMs),
    maxRssBytes: lower(bound.maxRssBytes, override?.maxRssBytes),
  };
}

const call = <K extends keyof Ops>(op: K, args: Parameters<Ops[K]>, limits?: LimitsOverride) =>
  runIsolated<SnarkjsTask, Awaited<ReturnType<Ops[K]>>>(
    WORKER,
    { op, args } as SnarkjsTask,
    limitsFor(op, limits),
    REPLY_CHECKS[op],
  );

/** `snarkjs groth16 setup`: the genesis zkey (δ = 1) for one circuit. */
export const newGenesisZkey = (
  r1cs: string,
  ptau: string,
  out: string,
  limits?: LimitsOverride,
): Promise<void> => call("newGenesisZkey", [r1cs, ptau, out], limits);

/** `snarkjs zkey contribute`; returns h_k as snarkjs reports it (hex). */
export const contribute = (
  input: string,
  output: string,
  name: string,
  entropy: string,
  limits?: LimitsOverride,
): Promise<string> => call("contribute", [input, output, name, entropy], limits);

/** `snarkjs zkey beacon`: the final, public-randomness step (SPEC §2.6). */
export const applyBeacon = (
  input: string,
  output: string,
  name: string,
  beaconHex: string,
  iterationsExp: number,
  limits?: LimitsOverride,
): Promise<void> => call("applyBeacon", [input, output, name, beaconHex, iterationsExp], limits);

/** `snarkjs zkey export verificationkey`, as plain JSON. */
export const exportVerificationKey = (
  zkey: string,
  limits?: LimitsOverride,
): Promise<Record<string, unknown>> => call("exportVerificationKey", [zkey], limits);

/** `zkey verify` from r1cs + ptau: valid only if snarkjs returns true and logs "ZKey Ok!". */
export const verifyFromR1cs = (
  r1cs: string,
  ptau: string,
  zkey: string,
  limits?: LimitsOverride,
): Promise<VerifyOutcome> => call("verifyFromR1cs", [r1cs, ptau, zkey], limits);

/** `zkey verifyfrominit`: the same checks from the genesis zkey. */
export const verifyFromInit = (
  genesis: string,
  ptau: string,
  zkey: string,
  limits?: LimitsOverride,
): Promise<VerifyOutcome> => call("verifyFromInit", [genesis, ptau, zkey], limits);
