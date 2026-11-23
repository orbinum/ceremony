/**
 * A circuit's final against the transcript, and what anchors a transcript to its ceremony. SPEC
 * §2.6, §6.2–6.4.
 */
import { describe, expect, it } from "vitest";
import {
  buildBeaconRecord,
  buildFinalRecord,
  checkAnchor,
  checkFinalRecord,
  checkIndependent,
  checkRecordsInWindow,
  checkSealedBeacon,
  headChain,
  transcriptOf,
} from "../../../src/ceremony/transcript";
import { roundTime } from "../../../src/ceremony/beacon";
import { DRAND } from "../../../src/config";
import type { IndependentVerdict } from "../../../src/verification";
import {
  ANNOUNCEMENT,
  ANNOUNCEMENT_SHA256,
  chain,
  contribution,
  GENESIS,
  h,
  ID,
  INIT,
  R1000,
} from "../../support";

const AT_1000 = { ...ANNOUNCEMENT, beacon: { ...ANNOUNCEMENT.beacon, round: 1000 } };
const LOCAL = { ...AT_1000, network: "local" as const };
const circuit = INIT.circuits[0] as (typeof INIT.circuits)[0];
const beacon = (chainHash: string = DRAND.chainHash) =>
  buildBeaconRecord({
    ceremonyId: ID,
    chainHash,
    round: R1000,
    iterationsExp: 10,
    relays: ["https://api.drand.sh", "https://drand.cloudflare.com"],
    sealedAt: new Date(roundTime(1000) * 1000 + 1000).toISOString(),
  });

describe("a final record against the transcript", () => {
  const records = chain([contribution(1), contribution(2), beacon()]);
  const final = buildFinalRecord({
    circuit: "shield",
    contributions: 2,
    finalZkeySha256: h(900),
    vkJsonSha256: h(901),
    vkHash: null,
    csHash: circuit.cs_hash,
    finalChain: headChain(records, GENESIS),
  });

  it("flags another circuit's csHash", () => {
    expect(checkFinalRecord(final, records, circuit, LOCAL)).toEqual([]);
    expect(checkFinalRecord({ ...final, cs_hash: h(8, 64) }, records, circuit, LOCAL)).toEqual([
      "csHash",
    ]);
  });

  it("surfaces the independent verifier's failed checks with the chain comparison", () => {
    const verdict: IndependentVerdict = {
      ok: false,
      failures: ["final-delta: δ = γ"],
      csHash: circuit.cs_hash,
      entries: [
        { kind: "contribution", hash: h(1, 64) },
        { kind: "contribution", hash: h(2, 64) },
        { kind: "beacon", hash: h(3, 64) },
      ],
    };
    expect(checkIndependent(verdict, records, circuit)).toEqual(["final-delta: δ = γ"]);
    expect(checkIndependent({ ...verdict, csHash: h(8, 64) }, records, circuit)).toEqual([
      "final-delta: δ = γ",
      "its csHash differs from init.json",
    ]);
    // Not ok, yet no failing check named: still a failure.
    expect(checkIndependent({ ...verdict, failures: [] }, records, circuit)).toEqual([
      "the independent verifier did not pass",
    ]);
  });
});

describe("a transcript of another ceremony", () => {
  it("fails the anchor even with the right announcement hash", () => {
    const t = transcriptOf("unit-test-2", ANNOUNCEMENT_SHA256, chain([contribution(1)]));
    expect(checkAnchor(t, ANNOUNCEMENT, ANNOUNCEMENT_SHA256)).toEqual(["ceremony id differs"]);
  });

  it("flags a record of another ceremony inside the window", () => {
    const foreign = { ...contribution(1), ceremony_id: "unit-test-2" };
    expect(checkRecordsInWindow(chain([foreign]), ANNOUNCEMENT)).toEqual([
      "record 0: another ceremony",
    ]);
  });

  it("flags a beacon from another drand chain", () => {
    expect(checkSealedBeacon(chain([beacon(h(9))]), AT_1000).problems).toEqual([
      "beacon from another drand chain",
    ]);
  });
});
