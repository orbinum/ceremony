/**
 * Attacks core's transcript checks, as `verify` runs them, with transcripts a malicious
 * coordinator writes (SPEC §6.3–6.4, §7).
 */
import { describe, expect, it } from "vitest";
import {
  buildAttestationRecord,
  buildBeaconRecord,
  buildFinalRecord,
  buildStateRecord,
  checkFinalRecord,
  checkSealedBeacon,
  checkTranscript,
  type ContributionRecord,
  transcriptOf,
  chainGenesis,
  type TranscriptRecord,
} from "../../../src/ceremony/transcript";
import { buildAttestationPayload } from "../../../src/coordination/attestation";
import { DRAND } from "../../../src/config";
import { checkFinalEntries } from "../../../src/verification";
import {
  ANNOUNCEMENT,
  ANNOUNCEMENT_SHA256,
  chain as chainFrom,
  contribution,
  contributor,
  h,
  ID,
  INIT,
  OPEN,
  R1000,
  R1001,
  signAttestation,
} from "../../support";

const CLIENT = { name: "client", version: "1.0.0", commit: "abc1234" };

/** A beacon for the announced round (the support announcement's round is not 1000: re-label). */
const ANN = { ...ANNOUNCEMENT, beacon: { ...ANNOUNCEMENT.beacon, round: 1000 } };
const chain = (records: readonly TranscriptRecord[]) => chainFrom(records, chainGenesis(ID, ANN));
const beacon = (round = R1000, sealedAt = "2026-10-10T00:00:00.000Z") =>
  buildBeaconRecord({
    ceremonyId: ID,
    chainHash: DRAND.chainHash,
    round,
    iterationsExp: ANN.beacon.iterations_exp,
    relays: ["a", "b"],
    sealedAt,
  });

const failing = (records: TranscriptRecord[], a = ANN) =>
  checkTranscript(
    transcriptOf(ID, ANNOUNCEMENT_SHA256, chain(records)),
    a,
    ANNOUNCEMENT_SHA256,
    INIT,
  )
    .checks.filter((c) => c.problems.length > 0)
    .map((c) => `${c.id}: ${c.problems.join("; ")}`);

const finalRecord = (finalChain: string) =>
  buildFinalRecord({
    circuit: "shield",
    contributions: 2,
    finalZkeySha256: h(1),
    vkJsonSha256: h(2),
    vkHash: `0x${h(3)}`,
    csHash: INIT.circuits[0]!.cs_hash,
    finalChain,
  });

describe("a malicious coordinator's transcript", () => {
  it("passes an honest one", () => {
    expect(failing([contribution(1), contribution(2), beacon()])).toEqual([]);
  });

  it("flags reordered contributions of one circuit, even with the chain recomputed", () => {
    expect(failing([contribution(2), contribution(1), beacon()]).join()).toMatch(
      /index 2 at position 1/,
    );
  });

  it("flags a contribution after the beacon, two beacons, another round and an early seal", () => {
    expect(failing([contribution(1), beacon(), contribution(2)]).join()).toMatch(
      /recorded after the beacon/,
    );
    expect(failing([contribution(1), contribution(2), beacon(), beacon()]).join()).toMatch(
      /2 beacon records/,
    );
    expect(failing([contribution(1), contribution(2), beacon(R1001)]).join()).toMatch(
      /round 1001, announced 1000/,
    );
    expect(
      failing([contribution(1), contribution(2), beacon(R1000, "2023-08-23T15:00:00.000Z")]).join(),
    ).toMatch(/sealed before the round was emitted/);
  });

  it("flags a circuit below the minimum", () => {
    expect(failing([contribution(1), beacon()]).join()).toMatch(
      /at least 2 contributions: shield: 1/,
    );
  });

  it("flags a link signature whose identity was rewritten after signing", () => {
    const r = contribution(1) as ContributionRecord;
    const forged = { ...r, identity: { ...r.identity!, github_login: "mallory" } };
    expect(failing([forged, contribution(2), beacon()]).join()).toMatch(
      /link signature does not verify/,
    );
  });

  it("flags an attestation signed by another wallet", () => {
    const records = chain([contribution(1), contribution(2)]);
    const alice = contributor(1);
    const payload = buildAttestationPayload({
      ceremonyId: ID,
      githubId: alice.github_id,
      account: alice.account,
      seq: 1,
      records,
      client: CLIENT,
    });
    const bad = buildAttestationRecord(payload, "eip712", signAttestation(2, payload));
    expect(failing([contribution(1), contribution(2), bad, beacon()]).join()).toMatch(
      /attestation of session 1: signature does not verify/,
    );
  });

  it("counts the coordinator's own validly linked contributions (KL-5)", () => {
    // Contributor 9 stands for a coordinator-run wallet: indistinguishable, and allowed.
    const own = contribution(2, 2, OPEN + 120_000, contributor(9));
    expect(failing([contribution(1), own, beacon()])).toEqual([]);
  });

  it("does not interpret state records (any from/to/reason passes)", () => {
    const weird = buildStateRecord(
      ID,
      { from: "FINALIZED", to: "OPEN", reason: "re-opened" },
      new Date(OPEN).toISOString(),
    );
    expect(failing([contribution(1), weird, contribution(2), beacon()])).toEqual([]);
  });

  it("accepts state records after the beacon, and then requires the last record's final_chain", () => {
    const after = buildStateRecord(
      ID,
      { from: "CLOSED", to: "OPEN", reason: "after beacon" },
      new Date(OPEN).toISOString(),
    );
    const records = chain([contribution(1), contribution(2), beacon(), after]);
    expect(checkSealedBeacon(records, ANN).problems).toEqual([]);
    const beaconChain = records[2]!.chain;
    expect(checkFinalRecord(finalRecord(beaconChain), records, INIT.circuits[0]!, ANN)).toEqual([
      "final_chain",
    ]);
    expect(
      checkFinalRecord(finalRecord(records[3]!.chain), records, INIT.circuits[0]!, ANN),
    ).toEqual([]);
  });

  it("flags a rewritten contributor name in the final-key re-walk", () => {
    const expected = {
      csHash: "cs",
      contributionHashes: ["h1", "h2"],
      contributionNames: ["alice", "bob"],
      minContributions: 2,
      beacon: { randomness: R1000.randomness, iterationsExp: 10 },
    };
    const entries = [
      { kind: "contribution", hash: "h1", name: "alice" },
      { kind: "contribution", hash: "h2", name: "mallory" },
      { kind: "beacon", hash: "hb", beaconHash: R1000.randomness, numIterationsExp: 10 },
    ];
    expect(checkFinalEntries({ csHash: "cs", entries } as never, expected)).toEqual([
      "entry 2 is named differently from the transcript",
    ]);
  });

  it("flags a final record for a circuit the ceremony does not have", () => {
    const records = chain([contribution(1), contribution(2), beacon()]);
    const extra = buildFinalRecord({
      circuit: "transfer",
      contributions: 0,
      finalZkeySha256: h(1),
      vkJsonSha256: h(2),
      vkHash: `0x${h(3)}`,
      csHash: h(4, 64),
      finalChain: records.at(-1)!.chain,
    });
    const t = transcriptOf(ID, ANNOUNCEMENT_SHA256, records, [extra]);
    const problems = checkTranscript(t, ANN, ANNOUNCEMENT_SHA256, INIT).checks.flatMap(
      (c) => c.problems,
    );
    expect(problems).toEqual(["transfer is not in init.json"]);
  });
});
