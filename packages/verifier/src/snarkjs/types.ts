/**
 * The isolated snarkjs operations as the in-process ones they run, the task the worker receives,
 * and the per-call bound override (tighter only, e.g. what is left of the service's deadline).
 */
import type { Limits } from "../isolate";
import type * as inProcess from "./in-process";

export type SnarkjsOps = {
  newGenesisZkey: typeof inProcess.newGenesisZkey;
  contribute: typeof inProcess.contribute;
  applyBeacon: typeof inProcess.applyBeacon;
  exportVerificationKey: typeof inProcess.exportVerificationKey;
  verifyFromR1cs: typeof inProcess.verifyFromR1cs;
  verifyFromInit: typeof inProcess.verifyFromInit;
};

export type SnarkjsTask = {
  [K in keyof SnarkjsOps]: { op: K; args: Parameters<SnarkjsOps[K]> };
}[keyof SnarkjsOps];

export type LimitsOverride = Partial<Limits>;
