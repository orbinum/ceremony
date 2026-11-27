/**
 * Builds a validated `ceremony.json` from what the operator decides; everything else is derived.
 * The beacon round is the first at the beacon time (close plus the delay), never chosen. Invited
 * ids may come in any order and repeat; they are stored sorted and unique. The delay must still
 * meet the network's minimum, which validation enforces.
 */
import { BEACON_ITERATIONS_EXP, DRAND, MAX_BEACON_DELAY_SECONDS } from "../../config";
import { FormatError } from "../../primitives/errors";
import { asSafeInt } from "../../primitives/schema";
import { roundAt } from "../beacon";
import { ANNOUNCEMENT_SCHEMA } from "./constants";
import type { Admission, CeremonyAnnouncement, Network } from "./types";
import { validateAnnouncement } from "./validate-announcement";

export interface AnnouncementInput {
  ceremonyId: string;
  network: Network;
  initSha256: string;
  circuitsSource: { repo: string; tag: string; commit: string };
  minContributions: number;
  admission?: Admission;
  open: Date;
  close: Date;
  beaconDelaySeconds: number;
}

const iso = (d: Date, field: string) => {
  if (Number.isNaN(d.getTime())) throw new FormatError(`${field}: invalid date`);
  return d.toISOString();
};

export function buildAnnouncement(input: AnnouncementInput): CeremonyAnnouncement {
  const delay = asSafeInt(
    input.beaconDelaySeconds,
    "beaconDelaySeconds",
    0,
    MAX_BEACON_DELAY_SECONDS,
  );
  const beaconAt = new Date(input.close.getTime() + delay * 1000);
  return validateAnnouncement({
    schema: ANNOUNCEMENT_SCHEMA,
    ceremony_id: input.ceremonyId,
    network: input.network,
    init_sha256: input.initSha256,
    circuits_source: input.circuitsSource,
    min_contributions: input.minContributions,
    ...(input.admission
      ? {
          admission: {
            mode: input.admission.mode,
            invited: [...new Set(input.admission.invited)].toSorted((x, y) => x - y),
          },
        }
      : {}),
    schedule: {
      open: iso(input.open, "open"),
      close: iso(input.close, "close"),
      beacon: iso(beaconAt, "beacon"),
    },
    beacon: {
      network: DRAND.network,
      chain_hash: DRAND.chainHash,
      round: roundAt(beaconAt.getTime() / 1000),
      iterations_exp: BEACON_ITERATIONS_EXP.drand,
    },
  });
}
