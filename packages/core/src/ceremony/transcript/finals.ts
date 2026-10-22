/**
 * A circuit's final against the transcript: what the key must embed and what the record says.
 * SPEC §2.6, §6.4.
 */
import type { FinalExpectation, IndependentVerdict } from "../../verification";
import { compareIndependent } from "../../verification";
import type { CeremonyAnnouncement } from "../announcement";
import type { InitCircuit } from "../init";
import type { BeaconRecord, Chained, FinalRecord } from "./types";
import { contributionsOf } from "./views";

/**
 * What the final key of `circuit` must embed: the recorded chain, names included, then the beacon.
 */
export function finalExpectationOf(
  records: readonly Chained[],
  circuit: InitCircuit,
  announcement: CeremonyAnnouncement,
  beacon: BeaconRecord,
): FinalExpectation {
  const accepted = contributionsOf(records, circuit.name);
  return {
    csHash: circuit.cs_hash,
    contributionHashes: accepted.map((r) => r.contribution_hash),
    contributionNames: accepted.map((r) => r.zkey_name),
    minContributions: announcement.min_contributions,
    beacon: { randomness: beacon.randomness, iterationsExp: beacon.iterations_exp },
  };
}

/**
 * `vk_hash` binds the final key to what the chain stores; only a local ceremony, which never
 * reaches a chain, may leave it null. SPEC §6.4.
 */
export const vkHashRequired = (announcement: CeremonyAnnouncement): boolean =>
  announcement.network !== "local";

/** The final record agrees with the transcript (the file hashes are compared by the caller). */
export function checkFinalRecord(
  final: FinalRecord,
  records: readonly Chained[],
  circuit: InitCircuit,
  announcement: CeremonyAnnouncement,
): string[] {
  const problems: string[] = [];
  if (final.vk_hash === null && vkHashRequired(announcement)) problems.push("vk_hash is null");
  if (final.contributions !== contributionsOf(records, circuit.name).length) {
    problems.push("contribution count");
  }
  if (final.cs_hash !== circuit.cs_hash) problems.push("csHash");
  if (final.final_chain !== records.at(-1)?.chain) problems.push("final_chain");
  return problems;
}

/** The independent verdict against the recorded chain of `circuit`. */
export const checkIndependent = (
  verdict: IndependentVerdict,
  records: readonly Chained[],
  circuit: InitCircuit,
): string[] => [
  ...verdict.failures,
  ...compareIndependent(
    verdict,
    contributionsOf(records, circuit.name).map((r) => r.contribution_hash),
    circuit.cs_hash,
  ),
];
