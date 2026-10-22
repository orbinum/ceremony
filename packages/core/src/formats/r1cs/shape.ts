/**
 * A compiled circuit against its pinned shape: field, constraints, public signals, domain. SPEC
 * §2.1.
 */
import { CIRCUITS, type CircuitName, PTAU } from "../../config";
import { BN254_FR } from "../bn254";
import type { R1csHeader } from "./header";

/**
 * Groth16 evaluation domain snarkjs needs: next power of two ≥ constraints + public signals + 1.
 */
export function domainPower(h: R1csHeader): number {
  return Math.ceil(Math.log2(h.constraints + h.publicOutputs + h.publicInputs + 1));
}

/** Every way the header differs from the pinned shape; empty means it matches. */
export function checkR1csShape(name: CircuitName, h: R1csHeader): string[] {
  const expected = CIRCUITS[name];
  const problems: string[] = [];
  if (h.prime !== BN254_FR) problems.push(`field ${h.prime} is not BN254 Fr`);
  if (h.constraints !== expected.constraints) {
    problems.push(`constraints ${h.constraints}, expected ${expected.constraints}`);
  }
  const pub = h.publicOutputs + h.publicInputs;
  if (pub !== expected.publicInputs) {
    problems.push(`public signals ${pub}, expected ${expected.publicInputs}`);
  }
  if (domainPower(h) > PTAU.power) {
    problems.push(`needs a 2^${domainPower(h)} domain, ptau provides 2^${PTAU.power}`);
  }
  return problems;
}
