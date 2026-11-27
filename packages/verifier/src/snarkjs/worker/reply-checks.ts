/**
 * What each isolated operation must answer: any other answer is a crash, never a pass. h_k is 64
 * bytes as lowercase hex, and a passing verification must carry snarkjs's own `ZKey Ok!` in its
 * log: the parent never takes the child's word alone.
 */
import { zkeyVerifyPassed } from "@orbinum-ceremony/core";
import type { VerifyOutcome } from "../in-process";
import type { SnarkjsOps } from "../types";

const isVoid = (v: unknown): v is void => v === undefined;
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isVerifyOutcome = (v: unknown): v is VerifyOutcome =>
  isObject(v) &&
  typeof v.log === "string" &&
  (v.ok === false || (v.ok === true && zkeyVerifyPassed(true, v.log)));

export const REPLY_CHECKS: {
  [K in keyof SnarkjsOps]: (v: unknown) => v is Awaited<ReturnType<SnarkjsOps[K]>>;
} = {
  newGenesisZkey: isVoid,
  contribute: (v): v is string => typeof v === "string" && /^[0-9a-f]{128}$/.test(v),
  applyBeacon: isVoid,
  exportVerificationKey: isObject,
  verifyFromR1cs: isVerifyOutcome,
  verifyFromInit: isVerifyOutcome,
};
