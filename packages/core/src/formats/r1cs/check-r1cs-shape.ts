/**
 * A compiled circuit against its shape: BN254, a domain the ptau covers and, once `init.json`
 * pins them, the same constraints and public signals. Returns every difference; empty means it
 * matches.
 */
import { PTAU } from "../../config";
import { BN254_FR } from "../bn254";
import { domainPower } from "./domain-power";
import type { R1csHeader } from "./types";

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
