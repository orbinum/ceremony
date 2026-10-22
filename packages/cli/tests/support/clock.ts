/** Fixed drand rounds and the times a replayed ceremony runs at, so no test waits for drand. */
import { MIN_BEACON_DELAY_SECONDS, type Network, roundTime } from "@orbinum-ceremony/core";

/** Real quicknet round, so finalize can run offline from a pre-sealed beacon. */
export const ROUND_1000 = {
  round: 1000,
  randomness: "fe290beca10872ef2fb164d2aa4442de4566183ec51c56ff3cd603d930e54fdd",
  signature:
    "b44679b9a59af2ec876b1a6b1ad52ea9b1615fc3982b19576350f93447cb1125e342b73a8dd2bacbe47e4b6b63ed5e39",
};
export const ROUND_1001 = {
  round: 1001,
  randomness: "b0a591ad1b9002cfc372ac6e30abd3da8d3088d4caae026961743474fb94235f",
  signature:
    "b33bf3667cbd5a82de3a24b4e0e9fe5513cc1a0e840368c6e31f5fcfa79bea03f73896b25883abf2853d10337fb8fa41",
};

/** When round 1000 was emitted (ms). */
export const T_ROUND = roundTime(ROUND_1000.round) * 1000;

/**
 * The schedule of a replayed ceremony on `network`: the beacon at round 1000, as soon after close
 * as the network allows, so contributions just before close and finalize after the round.
 */
export function scheduleFor(network: Network) {
  const beaconDelaySeconds = Math.max(60, MIN_BEACON_DELAY_SECONDS[network]);
  const close = new Date(T_ROUND - beaconDelaySeconds * 1000);
  const open = new Date(close.getTime() - 2 * 3600_000);
  return { open, close, beaconDelaySeconds, createdAt: new Date(open.getTime() - 3600_000) };
}

/** Moments of a replayed ceremony (any network: every close is ≥ 60 s before round 1000). */
export const CLOCK = {
  contribute: () => new Date(T_ROUND - 30 * 60_000),
  afterClose: () => new Date(T_ROUND - 30_000),
  finalize: () => new Date(T_ROUND + 60_000),
};
