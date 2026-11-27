/**
 * What a transcript means beyond its schema: links, window, minimum, beacon and simulation. The
 * announcement is re-targeted at round 1000 so the real drand vector seals it.
 */
import { describe, expect, it } from "vitest";
import {
  buildBeaconRecord,
  buildFinalRecord,
  buildStateRecord,
  chainGenesis,
  checkAnchor,
  checkCircuitLinks,
  checkContributable,
  checkFinalizable,
  checkFinalRecord,
  checkKnownCircuits,
  checkMinContributions,
  checkRecordsInWindow,
  checkSealedBeacon,
  checkSimulated,
  checkTranscript,
  checkTranscriptIntegrity,
  finalExpectationOf,
  headChain,
  nextSeq,
  receiptOf,
  sealedBeaconOf,
  transcriptOf,
  verifyChain,
  vkHashRequired,
} from "../../../../src/ceremony/transcript";
import { LOCAL_BUILD, LOCAL_VERIFIER } from "../../../../src/ceremony/identity";
import { roundTime } from "../../../../src/ceremony/beacon";
import { DRAND, VERIFY_DEADLINE_MS } from "../../../../src/config";
import {
  ANNOUNCEMENT,
  ANNOUNCEMENT_SHA256,
  chain,
  CLOSE,
  contribution,
  GENESIS,
  ID,
  INIT,
  R1000,
} from "../../../support";

const AT_1000 = { ...ANNOUNCEMENT, beacon: { ...ANNOUNCEMENT.beacon, round: 1000 } };
const beacon = (sealedAt = roundTime(1000) * 1000 + 1000) =>
  buildBeaconRecord({
    ceremonyId: ID,
    chainHash: DRAND.chainHash,
    round: R1000,
    iterationsExp: 10,
    relays: ["https://api.drand.sh", "https://drand.cloudflare.com"],
    sealedAt: new Date(sealedAt).toISOString(),
  });
const two = () => chain([contribution(1), contribution(2)]);
const chainGenesisOf = (a: typeof ANNOUNCEMENT) => chainGenesis(ID, a);
const late = (ms: number) => chain([contribution(1, 1, CLOSE + ms)]);

describe("chain", () => {
  it("detects reordering, a forged prev_chain, a replayed record and a non-serializable one", () => {
    const records = two();
    expect(verifyChain(records, GENESIS).ok).toBe(true);
    expect(verifyChain([records[1], records[0]] as typeof records, GENESIS)).toEqual({
      ok: false,
      position: 0,
    });
    const [a, b] = records as [(typeof records)[0], (typeof records)[0]];
    expect(verifyChain([a, { ...b, prev_chain: a.prev_chain }], GENESIS)).toEqual({
      ok: false,
      position: 1,
    });
    expect(verifyChain([a, a], GENESIS)).toEqual({ ok: false, position: 1 });
    expect(verifyChain([{ ...a, seq: Number.NaN } as typeof a], GENESIS)).toEqual({
      ok: false,
      position: 0,
    });
    expect(headChain(records, GENESIS)).toBe(b.chain);
    expect(headChain([], GENESIS)).toBe(GENESIS);
  });
});

describe("per-circuit links", () => {
  it("accepts a gap-free chain rooted in the genesis", () => {
    expect(checkCircuitLinks(two(), INIT)).toEqual([]);
  });

  it("detects a gap, a broken input, a lying client and an unknown circuit", () => {
    expect(checkCircuitLinks(chain([contribution(2)]), INIT)).toEqual([
      "shield: index 2 at position 1",
      "shield #2: input is not the previous output",
    ]);
    const liar = { ...contribution(1), client_contribution_hash: "ff".repeat(64) };
    expect(checkCircuitLinks(chain([liar]), INIT)).toEqual([
      "shield #1: client h_k differs from the verified h_k",
    ]);
    const other = { ...contribution(1), circuit: "transfer" as const };
    expect(checkKnownCircuits(chain([other]), INIT)).toEqual(["record 0: unknown circuit"]);
  });
});

describe("window and minimum", () => {
  it("accepts a result up to the verify deadline after the close, not later", () => {
    expect(checkRecordsInWindow(late(VERIFY_DEADLINE_MS), ANNOUNCEMENT)).toEqual([]);
    expect(checkRecordsInWindow(late(VERIFY_DEADLINE_MS + 1), ANNOUNCEMENT)).toEqual([
      "shield #1: accepted outside the contribution window",
    ]);
    expect(checkRecordsInWindow(chain([contribution(1, 1, 0)]), ANNOUNCEMENT)).toHaveLength(1);
  });

  it("counts contributions per circuit against the announced minimum", () => {
    expect(checkMinContributions(chain([contribution(1)]), INIT, ANNOUNCEMENT)).toEqual([
      "shield: 1",
    ]);
    expect(checkMinContributions(two(), INIT, ANNOUNCEMENT)).toEqual([]);
  });

  it("finalizes only after the close, with the minimum and every record in the window", () => {
    expect(checkFinalizable(two(), INIT, ANNOUNCEMENT, CLOSE - 1)).toEqual([
      `contributions are open until ${ANNOUNCEMENT.schedule.close}`,
    ]);
    expect(checkFinalizable(two(), INIT, ANNOUNCEMENT, CLOSE)).toEqual([]);
    expect(checkFinalizable(chain([contribution(1)]), INIT, ANNOUNCEMENT, CLOSE)).toEqual([
      "shield: 1 contributions",
    ]);
  });
});

describe("sealed beacon", () => {
  it("accepts the announced round, sealed once, after every contribution", () => {
    const records = chain([contribution(1), contribution(2), beacon()]);
    const r = checkSealedBeacon(records, AT_1000);
    expect(r.problems).toEqual([]);
    expect(sealedBeaconOf(records)?.round).toBe(1000);
  });

  it.each([
    ["none", () => chain([contribution(1)]), "0 beacon records"],
    ["two", () => chain([beacon(), beacon()]), "2 beacon records"],
    [
      "a contribution after it",
      () => chain([contribution(1), beacon(), contribution(2)]),
      "contribution recorded after the beacon was sealed",
    ],
    [
      "sealed before the round was emitted",
      () => chain([beacon(roundTime(1000) * 1000 - 1000)]),
      "sealed before the round was emitted",
    ],
  ])("flags %s", (_, records, problem) => {
    expect(checkSealedBeacon(records(), AT_1000).problems).toContain(problem);
  });

  it("flags another round, other iterations and a forged signature", () => {
    const b = beacon();
    expect(checkSealedBeacon(chain([b]), ANNOUNCEMENT).problems).toContain(
      `round 1000, announced ${ANNOUNCEMENT.beacon.round}`,
    );
    const forged = { ...b, randomness: "00".repeat(32) };
    expect(checkSealedBeacon(chain([forged]), AT_1000).problems).toContain(
      "drand BLS signature or randomness invalid",
    );
    const iterations = { ...b, iterations_exp: 11 };
    expect(checkSealedBeacon(chain([iterations]), AT_1000).problems).toContain(
      "unexpected iterations",
    );
  });
});

describe("whole transcript", () => {
  it("passes integrity and completeness on a finished ceremony", () => {
    const t = transcriptOf(
      ID,
      ANNOUNCEMENT_SHA256,
      chain([contribution(1), contribution(2), beacon()], chainGenesisOf(AT_1000)),
    );
    const { checks, beacon: sealed } = checkTranscript(t, AT_1000, ANNOUNCEMENT_SHA256, INIT);
    expect(checks.flatMap((c) => c.problems)).toEqual([]);
    expect(sealed?.round).toBe(1000);
  });

  it("reports an in-progress ceremony as intact but not complete", () => {
    const t = transcriptOf(ID, ANNOUNCEMENT_SHA256, chain([contribution(1)]));
    expect(
      checkTranscriptIntegrity(t, ANNOUNCEMENT, ANNOUNCEMENT_SHA256, INIT).flatMap(
        (c) => c.problems,
      ),
    ).toEqual([]);
    const { checks } = checkTranscript(t, ANNOUNCEMENT, ANNOUNCEMENT_SHA256, INIT);
    expect(checks.filter((c) => c.problems.length > 0).map((c) => c.id)).toEqual([
      "every circuit has at least 2 contributions",
      "beacon is the announced drand round, sealed once after all contributions",
    ]);
  });

  it("flags another anchor and a broken chain", () => {
    const t = transcriptOf(ID, "00".repeat(32), chain([contribution(1)], "11".repeat(32)));
    expect(checkAnchor(t, ANNOUNCEMENT, ANNOUNCEMENT_SHA256)).toEqual(["anchor SHA-256 differs"]);
    const checks = checkTranscriptIntegrity(t, ANNOUNCEMENT, ANNOUNCEMENT_SHA256, INIT);
    expect(checks.find((c) => c.id.startsWith("hash chain"))?.problems).toEqual([
      "broken at record 0",
    ]);
  });
});

describe("views and builders", () => {
  it("numbers sessions and cuts receipts", () => {
    const records = chain([contribution(1, 1), contribution(2, 4)]);
    expect(nextSeq(records)).toBe(5);
    expect(nextSeq([])).toBe(1);
    const t = transcriptOf(ID, ANNOUNCEMENT_SHA256, records);
    expect(receiptOf(t, 4)?.records.map((r) => r.seq)).toEqual([4]);
    expect(receiptOf(t, 2)).toBeNull();
  });

  it("validates what it builds", () => {
    expect(() =>
      buildStateRecord(ID, { from: "OPEN", to: "PAUSED", reason: "" }, "2026-10-01T00:00:00.000Z"),
    ).toThrow(/reason/);
    expect(
      buildStateRecord(
        ID,
        { from: "OPEN", to: "PAUSED", reason: "operator" },
        "2026-10-01T00:00:00.000Z",
      ).type,
    ).toBe("state");
  });

  it("derives a final's expectation and checks its record", () => {
    const records = chain([contribution(1), contribution(2), beacon()]);
    const circuit = INIT.circuits[0] as (typeof INIT.circuits)[0];
    const expected = finalExpectationOf(records, circuit, AT_1000, beacon());
    expect(expected.contributionNames).toEqual(["contributor-1", "contributor-2"]);
    const final = buildFinalRecord({
      circuit: "shield",
      contributions: 2,
      finalZkeySha256: "00".repeat(32),
      vkJsonSha256: "00".repeat(32),
      vkHash: null,
      csHash: circuit.cs_hash,
      finalChain: headChain(records, GENESIS),
    });
    const LOCAL = { ...AT_1000, network: "local" as const };
    expect(checkFinalRecord(final, records, circuit, LOCAL)).toEqual([]);
    expect(
      checkFinalRecord(
        { ...final, contributions: 3, final_chain: "00".repeat(32) },
        records,
        circuit,
        LOCAL,
      ),
    ).toEqual(["contribution count", "final_chain"]);
  });

  it("requires vk_hash on every network but local", () => {
    const records = chain([contribution(1), beacon()]);
    const circuit = INIT.circuits[0] as (typeof INIT.circuits)[0];
    const final = buildFinalRecord({
      circuit: "shield",
      contributions: 1,
      finalZkeySha256: "00".repeat(32),
      vkJsonSha256: "00".repeat(32),
      vkHash: null,
      csHash: circuit.cs_hash,
      finalChain: headChain(records, GENESIS),
    });
    expect(vkHashRequired(AT_1000)).toBe(true);
    expect(vkHashRequired({ ...AT_1000, network: "local" })).toBe(false);
    expect(checkFinalRecord(final, records, circuit, AT_1000)).toEqual(["vk_hash is null"]);
    expect(
      checkFinalRecord({ ...final, vk_hash: `0x${"ab".repeat(32)}` }, records, circuit, AT_1000),
    ).toEqual([]);
  });
});

const simulated = (k: number) => {
  const r = contribution(k);
  return {
    ...r,
    client: { ...r.client, commit: LOCAL_BUILD },
    verified_by: { ...r.verified_by, verifier_version: LOCAL_VERIFIER },
  };
};

describe("simulated contributions", () => {
  it("are allowed in rehearsals (local, testnet) and refused on mainnet", () => {
    const records = chain([simulated(1), simulated(2)]);
    expect(checkSimulated(records, { ...ANNOUNCEMENT, network: "local" })).toEqual([]);
    expect(checkSimulated(records, ANNOUNCEMENT)).toEqual([]);
    expect(checkSimulated(records, { ...ANNOUNCEMENT, network: "mainnet" })).toEqual([
      "shield #1: simulated contribution on mainnet",
      "shield #2: simulated contribution on mainnet",
    ]);
  });

  it("are recognised by either marker, and an online contribution is not one", () => {
    const MAINNET = { ...ANNOUNCEMENT, network: "mainnet" as const };
    const r = contribution(1);
    const onlyClient = { ...r, client: { ...r.client, commit: LOCAL_BUILD } };
    const onlyVerifier = {
      ...r,
      verified_by: { ...r.verified_by, verifier_version: LOCAL_VERIFIER },
    };
    expect(checkSimulated(chain([r]), MAINNET)).toEqual([]);
    expect(checkSimulated(chain([onlyClient]), MAINNET)).toHaveLength(1);
    expect(checkSimulated(chain([onlyVerifier]), MAINNET)).toHaveLength(1);
  });

  it("fail the transcript integrity check on mainnet", () => {
    const MAINNET = { ...ANNOUNCEMENT, network: "mainnet" as const };
    const checks = checkTranscriptIntegrity(
      transcriptOf(ID, ANNOUNCEMENT_SHA256, chain([simulated(1)])),
      MAINNET,
      ANNOUNCEMENT_SHA256,
      INIT,
    );
    expect(checks.find((c) => c.id === "no simulated contributions on mainnet")?.problems).toEqual([
      "shield #1: simulated contribution on mainnet",
    ]);
  });
});

describe("checkContributable", () => {
  const OPEN = Date.parse(ANNOUNCEMENT.schedule.open);

  it("accepts inside the window before the beacon", () => {
    expect(checkContributable(chain([contribution(1)]), ANNOUNCEMENT, OPEN)).toEqual([]);
  });

  it("refuses before open, at or after close, and once the beacon is sealed", () => {
    expect(checkContributable([], ANNOUNCEMENT, OPEN - 1)).toEqual([
      `contributions open at ${ANNOUNCEMENT.schedule.open}`,
    ]);
    expect(checkContributable([], ANNOUNCEMENT, CLOSE)).toEqual([
      `contributions closed at ${ANNOUNCEMENT.schedule.close}`,
    ]);
    expect(checkContributable(chain([contribution(1), beacon()]), ANNOUNCEMENT, OPEN)).toEqual([
      "the beacon is sealed: contributions are closed",
    ]);
  });
});
