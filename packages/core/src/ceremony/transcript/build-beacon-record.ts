/** Builds a validated beacon record for a verified drand round and the relays that agreed on it. */
import type { DrandRound } from "../beacon";
import type { BeaconRecord } from "./types";
import { validateRecord } from "./validate";

export const buildBeaconRecord = (input: {
  ceremonyId: string;
  chainHash: string;
  round: DrandRound;
  iterationsExp: number;
  relays: string[];
  sealedAt: string;
}): BeaconRecord =>
  validateRecord({
    type: "beacon",
    ceremony_id: input.ceremonyId,
    source: "drand",
    chain_hash: input.chainHash,
    round: input.round.round,
    randomness: input.round.randomness,
    signature: input.round.signature,
    iterations_exp: input.iterationsExp,
    relays: input.relays,
    sealed_at: input.sealedAt,
  } satisfies BeaconRecord) as BeaconRecord;
