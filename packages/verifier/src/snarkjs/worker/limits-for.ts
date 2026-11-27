/**
 * The bounds an isolated snarkjs operation runs under: its class's (`LIMITS`), grown by
 * `PER_ENTRY_MS` per MPC entry for the verifications (they re-walk every entry), then lowered,
 * never raised, by `override`.
 */
import { LIMITS, type Limits } from "../../isolate";
import { PER_ENTRY_MS } from "./constants";
import type { LimitsOverride, SnarkjsOps } from "../types";

const CLASS: Record<keyof SnarkjsOps, keyof typeof LIMITS> = {
  newGenesisZkey: "heavy",
  verifyFromR1cs: "heavy",
  contribute: "medium",
  applyBeacon: "medium",
  verifyFromInit: "medium",
  exportVerificationKey: "light",
};

const WALKS_CHAIN: ReadonlySet<keyof SnarkjsOps> = new Set(["verifyFromR1cs", "verifyFromInit"]);

const lower = (bound: number, override: number | undefined) =>
  override !== undefined && override > 0 ? Math.min(bound, override) : bound;

export function limitsFor(op: keyof SnarkjsOps, override?: LimitsOverride, entries = 0): Limits {
  const bound = LIMITS[CLASS[op]];
  const walk = WALKS_CHAIN.has(op) ? Math.max(0, Math.trunc(entries)) * PER_ENTRY_MS : 0;
  return {
    timeoutMs: lower(bound.timeoutMs + walk, override?.timeoutMs),
    maxRssBytes: lower(bound.maxRssBytes, override?.maxRssBytes),
  };
}
