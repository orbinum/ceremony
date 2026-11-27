/**
 * A circuit's final record agrees with the transcript: `vk_hash` where required, the contribution
 * count, the csHash and the final chain value. The file hashes are compared by the caller.
 */
import type { CeremonyAnnouncement } from "../../announcement";
import type { InitCircuit } from "../../init";
import { contributionsOf } from "../reads";
import type { Chained, FinalRecord } from "../types";
import { vkHashRequired } from "./vk-hash-required";

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
