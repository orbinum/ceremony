/**
 * Building `ceremony.json`: the beacon round is derived from the schedule, never chosen. SPEC §5.2.
 */
import { BEACON_ITERATIONS_EXP, DRAND, MAX_BEACON_DELAY_SECONDS } from "../../config";
import { FormatError } from "../../primitives/errors";
import { asSafeInt } from "../../primitives/schema";
import { roundAt } from "../beacon";
import { ANNOUNCEMENT_SCHEMA, type CeremonyAnnouncement, type Network } from "./types";
import { validateAnnouncement } from "./validate";

/** What the operator decides; everything else is derived. */
export interface AnnouncementInput {
  ceremonyId: string;
  network: Network;
  initSha256: string;
  circuitsSource: { repo: string; tag: string; commit: string };
  minContributions: number;
  open: Date;
  close: Date;
  /** Delay between close and the beacon round: at least the network's minimum (SPEC §5.2). */
  beaconDelaySeconds: number;
}

const iso = (d: Date, field: string) => {
  if (Number.isNaN(d.getTime())) throw new FormatError(`${field}: invalid date`);
  return d.toISOString();
};

/** A validated announcement. */
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
