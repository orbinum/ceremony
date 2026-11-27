/**
 * What a circuit's final key must embed according to the transcript: the recorded chain of
 * contributions, names included, then the beacon.
 */
import type { FinalExpectation } from "../../verification";
import type { CeremonyAnnouncement } from "../announcement";
import type { InitCircuit } from "../init";
import { contributionsOf } from "./contributions-of";
import type { BeaconRecord, Chained } from "./types";

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
