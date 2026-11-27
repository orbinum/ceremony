/**
 * The independent verifier's verdict against a circuit's recorded chain. A verdict that is not ok
 * without naming a failing check is still a failure.
 */
import { compareIndependent, type IndependentVerdict } from "../../verification";
import type { InitCircuit } from "../init";
import { contributionsOf } from "./contributions-of";
import type { Chained } from "./types";

export const checkIndependent = (
  verdict: IndependentVerdict,
  records: readonly Chained[],
  circuit: InitCircuit,
): string[] => [
  ...verdict.failures,
  ...(verdict.ok || verdict.failures.length > 0 ? [] : ["the independent verifier did not pass"]),
  ...compareIndependent(
    verdict,
    contributionsOf(records, circuit.name).map((r) => r.contribution_hash),
    circuit.cs_hash,
  ),
];
