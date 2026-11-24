/**
 * A compiled circuit against its shape: BN254, a domain the ptau covers and, once `init.json`
 * pins them, the same constraints and public signals. SPEC §2.1.
 */
import { PTAU } from "../../config";
import { BN254_FR } from "../bn254";
import type { R1csHeader } from "./header";

/**
 * Groth16 evaluation domain snarkjs needs: next power of two ≥ constraints + public signals + 1.
 */
export function domainPower(
  h: Pick<R1csHeader, "constraints" | "publicOutputs" | "publicInputs">,
): number {
  return Math.ceil(Math.log2(h.constraints + h.publicOutputs + h.publicInputs + 1));
}

/** Every way the header differs from the shape; empty means it matches. */
export function checkR1csShape(
  h: R1csHeader,
  pinned?: { constraints: number; public_signals: number; domain_power: number },
): string[] {
  const problems: string[] = [];
  if (h.prime !== BN254_FR) problems.push(`field ${h.prime} is not BN254 Fr`);
  if (pinned && h.constraints !== pinned.constraints) {
    problems.push(`constraints ${h.constraints}, expected ${pinned.constraints}`);
  }
  const pub = h.publicOutputs + h.publicInputs;
  if (pinned && pub !== pinned.public_signals) {
    problems.push(`public signals ${pub}, expected ${pinned.public_signals}`);
  }
  if (pinned && domainPower(h) !== pinned.domain_power) {
    problems.push(`domain 2^${domainPower(h)}, expected 2^${pinned.domain_power}`);
  }
  if (domainPower(h) > PTAU.power) {
    problems.push(`needs a 2^${domainPower(h)} domain, ptau provides 2^${PTAU.power}`);
  }
  return problems;
}
