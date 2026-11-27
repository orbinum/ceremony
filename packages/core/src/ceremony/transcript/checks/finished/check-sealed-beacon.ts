/**
 * The sealed beacon is the announced round, sealed once, after every contribution, verifiable
 * against the pinned drand key, and not sealed before it was emitted.
 */
import { DRAND } from "../../../../config";
import type { CeremonyAnnouncement } from "../../../announcement";
import { roundTime, verifyDrandRound } from "../../../beacon";
import type { BeaconRecord, Chained } from "../../types";

export function checkSealedBeacon(
  records: readonly Chained[],
  announcement: CeremonyAnnouncement,
): { beacon?: Chained<BeaconRecord>; problems: string[] } {
  const announced = announcement.beacon;
  const beacons = records.filter((r): r is Chained<BeaconRecord> => r.type === "beacon");
  const beacon = beacons[0];
  if (beacons.length !== 1 || !beacon) return { problems: [`${beacons.length} beacon records`] };

  const problems: string[] = [];
  if (records.slice(records.indexOf(beacon)).some((r) => r.type === "contribution")) {
    problems.push("contribution recorded after the beacon was sealed");
  }
  if (beacon.round !== announced.round)
    problems.push(`round ${beacon.round}, announced ${announced.round}`);
  if (beacon.chain_hash !== DRAND.chainHash) problems.push("beacon from another drand chain");
  if (beacon.iterations_exp !== announced.iterations_exp) problems.push("unexpected iterations");
  if (Date.parse(beacon.sealed_at) < roundTime(beacon.round) * 1000) {
    problems.push("sealed before the round was emitted");
  }
  if (!verifyDrandRound(beacon)) problems.push("drand BLS signature or randomness invalid");
  return { beacon, problems };
}
