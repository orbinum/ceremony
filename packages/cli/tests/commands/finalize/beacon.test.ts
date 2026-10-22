/** Sealing the announced drand round: relays, quorum, and an already-sealed beacon (SPEC §5). */
import {
  buildAnnouncement,
  buildBeaconRecord,
  type Chained,
  chainGenesis,
  DRAND,
  roundTime,
  type TranscriptRecord,
  transcriptOf,
  appendRecord,
} from "@orbinum-ceremony/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sealBeacon } from "../../../src/commands/finalize/beacon";
import type { TranscriptStore } from "../../../src/store";
import { ROUND_1000, ROUND_1001 } from "../../support";

const T = roundTime(1000) * 1000;
const announcement = {
  ...buildAnnouncement({
    ceremonyId: "beacon-test",
    network: "local",
    initSha256: "00".repeat(32),
    circuitsSource: {
      repo: "https://github.com/orbinum/circuits",
      tag: "v1",
      commit: "a".repeat(40),
    },
    minContributions: 1,
    open: new Date(T - 7200_000),
    close: new Date(T - 3600_000),
    beaconDelaySeconds: 0,
  }),
};
announcement.beacon = { ...announcement.beacon, round: 1000 };

/** A transcript held in memory, appended like the operator's store. */
function memoryStore(): TranscriptStore {
  const genesis = chainGenesis(announcement.ceremony_id, announcement);
  const transcript = transcriptOf(announcement.ceremony_id, "11".repeat(32), []);
  return {
    transcript,
    genesis,
    save: async () => undefined,
    append: async <R extends TranscriptRecord>(record: R) => {
      const chained = appendRecord(transcript.records, genesis, record) as Chained<R>;
      transcript.records.push(chained);
      return chained;
    },
  };
}

const relayAnswers = (answer: (relay: string) => unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn<(url: string) => Promise<Response>>(async (url) => {
      const relay = DRAND.relays.find((r) => url.startsWith(r)) as string;
      const body = answer(relay);
      return body === undefined
        ? new Response("down", { status: 503 })
        : new Response(JSON.stringify(body), { status: 200 });
    }),
  );

afterEach(() => vi.unstubAllGlobals());

describe("sealing the announced beacon", () => {
  it("seals the round the relays agree on, after it was emitted", async () => {
    relayAnswers(() => ROUND_1000);
    const store = memoryStore();
    const beacon = await sealBeacon(store, announcement, new Date(T + 60_000));
    expect(beacon).toMatchObject({ round: 1000, randomness: ROUND_1000.randomness });
    expect(beacon.relays.length).toBeGreaterThanOrEqual(2);
    expect(store.transcript.records).toHaveLength(1);
  });

  it("refuses a round not emitted yet without asking anyone", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", fetch);
    await expect(sealBeacon(memoryStore(), announcement, new Date(T - 1))).rejects.toThrow(
      /is emitted at/,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not seal what only one relay says, nor a forged round", async () => {
    const [first] = DRAND.relays;
    relayAnswers((relay) => (relay === first ? ROUND_1000 : undefined));
    await expect(sealBeacon(memoryStore(), announcement, new Date(T + 60_000))).rejects.toThrow(
      /drand round 1000/,
    );
    relayAnswers(() => ({ ...ROUND_1000, randomness: "00".repeat(32) }));
    const store = memoryStore();
    await expect(sealBeacon(store, announcement, new Date(T + 60_000))).rejects.toThrow(
      /drand round 1000/,
    );
    expect(store.transcript.records).toEqual([]);
  });

  it("re-checks a beacon already sealed instead of sealing again", async () => {
    relayAnswers(() => ROUND_1000);
    const store = memoryStore();
    await sealBeacon(store, announcement, new Date(T + 60_000));
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", fetch);
    await sealBeacon(store, announcement, new Date(T + 120_000));
    expect(fetch).not.toHaveBeenCalled();
    expect(store.transcript.records).toHaveLength(1);
  });

  it("refuses a sealed beacon that is not the announced round, without asking anyone", async () => {
    const store = memoryStore();
    await store.append(
      buildBeaconRecord({
        ceremonyId: announcement.ceremony_id,
        chainHash: DRAND.chainHash,
        round: ROUND_1001,
        iterationsExp: announcement.beacon.iterations_exp,
        relays: ["https://relay.example"],
        sealedAt: new Date(T + 60_000).toISOString(),
      }),
    );
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", fetch);
    await expect(sealBeacon(store, announcement, new Date(T + 120_000))).rejects.toThrow(
      /^the sealed beacon is not valid: /,
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(store.transcript.records).toHaveLength(1);
  });
});
