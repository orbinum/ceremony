/**
 * Sealing the announced drand round: fetched from every relay, agreed on by core's quorum rule,
 * recorded by core's builder, and re-checked by core when it is already sealed. SPEC §5.
 */
import {
  type BeaconRecord,
  buildBeaconRecord,
  type CeremonyAnnouncement,
  checkSealedBeacon,
  DRAND,
  relayQuorum,
  roundTime,
  sealedBeaconOf,
} from "@orbinum-ceremony/core";
import { fetchJson } from "../../io";
import type { TranscriptStore } from "../../store";

/** Every relay's answer for `round`; a relay that fails simply has no answer. */
async function askRelays(round: number) {
  const answers = await Promise.allSettled(
    DRAND.relays.map(async (relay) => ({
      relay,
      body: await fetchJson(`${relay}/${DRAND.chainHash}/public/${round}`),
    })),
  );
  return answers.flatMap((a) => (a.status === "fulfilled" ? [a.value] : []));
}

/**
 * Seals the announced round as a `beacon` record, or returns the one already sealed after
 * re-checking it. The round always comes from the announcement: it cannot be chosen (SPEC §5.2).
 */
export async function sealBeacon(
  store: TranscriptStore,
  announcement: CeremonyAnnouncement,
  now: Date,
): Promise<BeaconRecord> {
  if (sealedBeaconOf(store.transcript.records)) {
    const { beacon, problems } = checkSealedBeacon(store.transcript.records, announcement);
    if (!beacon || problems.length > 0) {
      throw new Error(`the sealed beacon is not valid: ${problems.join("; ")}`);
    }
    return beacon;
  }

  const { round } = announcement.beacon;
  const emitted = new Date(roundTime(round) * 1000);
  if (now < emitted) throw new Error(`drand round ${round} is emitted at ${emitted.toISOString()}`);
  const agreed = relayQuorum(round, await askRelays(round));
  if (!agreed.ok) throw new Error(`drand round ${round}: ${agreed.reason}`);
  return store.append(
    buildBeaconRecord({
      ceremonyId: store.transcript.ceremony_id,
      chainHash: DRAND.chainHash,
      round: agreed.value,
      iterationsExp: announcement.beacon.iterations_exp,
      relays: agreed.relays,
      sealedAt: now.toISOString(),
    }),
  );
}
