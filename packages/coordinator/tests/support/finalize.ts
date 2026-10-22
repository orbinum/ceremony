/**
 * A ceremony that ran in the past around drand round 1000 (a real quicknet round, so the sealed
 * beacon verifies), driven under a faked clock up to `cli finalize`'s request.
 */
import {
  appendRecord,
  buildBeaconRecord,
  buildFinalRecord,
  type Chained,
  type CircuitName,
  DRAND,
  type DrandRound,
  type FinalizeRequest,
  roundTime,
  type Setup,
  sha256Hex,
} from "@orbinum-ceremony/core";
import { INIT, setupInput } from "./setup";

/** Quicknet round 1000, as api.drand.sh serves it. */
export const R1000: DrandRound = {
  round: 1000,
  randomness: "fe290beca10872ef2fb164d2aa4442de4566183ec51c56ff3cd603d930e54fdd",
  signature:
    "b44679b9a59af2ec876b1a6b1ad52ea9b1615fc3982b19576350f93447cb1125e342b73a8dd2bacbe47e4b6b63ed5e39",
};

/** When round 1000 was emitted (epoch ms). */
export const ROUND_AT = roundTime(R1000.round) * 1000;
/** The ceremony's opening, three hours before the round. */
export const OPEN = ROUND_AT - 3 * 3_600_000;
/** The ceremony's close, an hour before the round (the beacon delay). */
export const CLOSE = ROUND_AT - 3_600_000;

/** A one-circuit (shield) local setup whose beacon is round 1000. */
export function pastSetup() {
  const init = structuredClone(INIT);
  init.circuits = init.circuits.filter((c) => c.name === "shield");
  return setupInput(OPEN, CLOSE, {
    init,
    beaconDelaySeconds: (ROUND_AT - CLOSE) / 1000,
  });
}

/** The bytes of a circuit's final files, as `finalize` writes them. */
export const finalBytes = (c: CircuitName) => ({
  zkey: new TextEncoder().encode(`final zkey of ${c}`),
  vk: new TextEncoder().encode(`{"vk":"${c}"}`),
});

/**
 * What `cli finalize` sends from the transcript it downloaded: the beacon chained after its head
 * and one final per circuit of `setup`, bound to the beacon and to `finalBytes`.
 */
export function finalizeRequest(setup: Setup, records: readonly Chained[]): FinalizeRequest {
  const beacon = appendRecord(
    records,
    setup.chainGenesis,
    buildBeaconRecord({
      ceremonyId: setup.announcement.ceremony_id,
      chainHash: DRAND.chainHash,
      round: R1000,
      iterationsExp: setup.announcement.beacon.iterations_exp,
      relays: ["https://api.drand.sh", "https://drand.cloudflare.com"],
      sealedAt: new Date(ROUND_AT + 5000).toISOString(),
    }),
  );
  const finals = setup.init.circuits.map((c) =>
    buildFinalRecord({
      circuit: c.name,
      contributions: records.filter((r) => r.type === "contribution" && r.circuit === c.name)
        .length,
      finalZkeySha256: sha256Hex(finalBytes(c.name).zkey),
      vkJsonSha256: sha256Hex(finalBytes(c.name).vk),
      vkHash: null,
      csHash: c.cs_hash,
      finalChain: beacon.chain,
    }),
  );
  return { beacon: beacon as FinalizeRequest["beacon"], finals };
}
