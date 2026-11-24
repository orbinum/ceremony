/**
 * The operator's finalization: the sealed beacon chained after the coordinator's head and one
 * final per circuit bound to it, or nothing changes; a sealed ceremony refuses everything after.
 * SPEC §2.6, §4.3.
 */
import { describe, expect, it } from "vitest";
import { buildAnnouncement } from "../../../src/ceremony/announcement";
import { roundTime } from "../../../src/ceremony/beacon";
import { buildInit } from "../../../src/ceremony/init";
import { parseSetup } from "../../../src/ceremony/setup";
import {
  appendRecord,
  buildBeaconRecord,
  buildContributionRecord,
  buildFinalRecord,
  buildStateRecord,
  type Chained,
  type FinalRecord,
} from "../../../src/ceremony/transcript";
import { DRAND } from "../../../src/config";
import { checkFinalize } from "../../../src/coordination/finalize";
import { validateFinalizeRequest } from "../../../src/coordination/protocol";
import { attestStep, initialQueue, recordsOfEffects, step } from "../../../src/coordination/queue";
import { serializeJson, utf8 } from "../../../src/primitives/encoding";
import { sha256Hex } from "../../../src/primitives/hashing";
import { contributor, h, INIT, R1000, R1001, CIRCUIT_NAMES } from "../../support";

const ID = "finalize-1";
const ROUND_AT = roundTime(1000) * 1000;
const OPEN = ROUND_AT - 3 * 3600_000;
const CLOSE = ROUND_AT - 3600_000;
const NOW = ROUND_AT + 60_000;

const init = buildInit({
  ceremonyId: ID,
  createdAt: new Date(OPEN - 3600_000).toISOString(),
  circom: INIT.tooling.circom,
  circomlib: INIT.tooling.circomlib,
  circomFlags: INIT.tooling.circom_flags,
  source: INIT.source,
  circuits: INIT.circuits,
});
const initText = serializeJson(init);
const SETUP = parseSetup(
  {
    announcement: serializeJson(
      buildAnnouncement({
        ceremonyId: ID,
        network: "local",
        initSha256: sha256Hex(utf8(initText)),
        circuitsSource: {
          repo: "https://github.com/orbinum/circuits",
          tag: "v0.16.0",
          commit: init.source.commit,
        },
        minContributions: 2,
        open: new Date(OPEN),
        close: new Date(CLOSE),
        beaconDelaySeconds: (ROUND_AT - CLOSE) / 1000,
      }),
    ),
    init: initText,
    genesisSizes: { shield: 1000 },
  },
  ID,
);
const CLOSED = step(
  initialQueue({ openAt: OPEN, closeAt: CLOSE }, CIRCUIT_NAMES),
  { type: "tick" },
  CLOSE,
).state;

const contribution = (k: number) =>
  buildContributionRecord({
    ceremonyId: ID,
    seq: k,
    circuit: "shield",
    index: k,
    claimed: {
      inputSha256: k === 1 ? h(100) : h(100 + k - 1),
      outputSha256: h(100 + k),
      contributionHash: h(k, 64),
      method: "browser",
      client: { name: "web", version: "1.0.0", commit: "abc1234" },
    },
    verified: {
      contributionHash: h(k, 64),
      zkeyName: `contributor-${k}`,
      deltaAfter: h(200 + k, 64),
      logSha256: h(300 + k),
      verifierVersion: "0.1.0",
      snarkjsVersion: "0.7.6",
    },
    contributor: contributor(k, ID),
    at: new Date(OPEN + k * 60_000).toISOString(),
  });

function chained(records: Parameters<typeof appendRecord>[2][]): Chained[] {
  const out: Chained[] = [];
  for (const r of records) out.push(appendRecord(out, SETUP.chainGenesis, r));
  return out;
}

const RECORDS = chained([contribution(1), contribution(2)]);

const beaconOf = (round = R1000, sealedAt = ROUND_AT + 5000) =>
  buildBeaconRecord({
    ceremonyId: ID,
    chainHash: DRAND.chainHash,
    round,
    iterationsExp: 10,
    relays: ["https://api.drand.sh", "https://drand.cloudflare.com"],
    sealedAt: new Date(sealedAt).toISOString(),
  });

/**
 * What `finalize` produces from the transcript it downloaded: the chained beacon and the finals.
 */
function request(downloaded: readonly Chained[] = RECORDS, beacon = beaconOf()) {
  const sealed = appendRecord(downloaded, SETUP.chainGenesis, beacon);
  const final: FinalRecord = buildFinalRecord({
    circuit: "shield",
    contributions: downloaded.filter((r) => r.type === "contribution").length,
    finalZkeySha256: h(900),
    vkJsonSha256: h(901),
    vkHash: null,
    csHash: init.circuits[0]!.cs_hash,
    finalChain: sealed.chain,
  });
  return { beacon: sealed, finals: [final] };
}

const problemsOf = (r: ReturnType<typeof checkFinalize>) => (r.ok ? [] : r.problems);

describe("checkFinalize", () => {
  it("seals the transcript: the beacon is its last record and the finals bind to it", () => {
    const req = request();
    const r = checkFinalize(SETUP, CLOSED, RECORDS, req, NOW);
    if (!r.ok) throw new Error(r.problems.join("; "));
    expect(r.result.state.phase).toBe("FINALIZED");
    expect(r.result.effects).toEqual([{ type: "finalized" }]);
    const { prev_chain: _p, chain: _c, ...beacon } = req.beacon;
    expect(recordsOfEffects(ID, r.result.effects, "t", r.beacon)).toEqual([beacon]);
    expect(appendRecord(RECORDS, SETUP.chainGenesis, r.beacon).chain).toBe(
      req.finals[0]?.final_chain,
    );
    expect(r.files).toEqual([
      { key: "final/shield.final.zkey", sha256: h(900) },
      { key: "final/shield.vk.json", sha256: h(901) },
    ]);
  });

  it("refuses unless the ceremony is CLOSED with no session, and once it is sealed", () => {
    const open = step(
      initialQueue({ openAt: OPEN, closeAt: CLOSE }, CIRCUIT_NAMES),
      { type: "tick" },
      OPEN,
    ).state;
    expect(checkFinalize(SETUP, open, RECORDS, request(), OPEN + 1)).toEqual({
      ok: false,
      refusal: "invalid-transition",
      problems: [],
    });
    const sealed = { ...CLOSED, phase: "FINALIZED" as const };
    expect(checkFinalize(SETUP, sealed, RECORDS, request(), NOW)).toMatchObject({
      ok: false,
      refusal: "finalized",
    });
    expect(attestStep(sealed, 101, 1, NOW)).toMatchObject({ ok: false, refusal: "finalized" });
  });

  it("refuses a beacon sealed on a transcript that moved since the download", () => {
    const moved = chained([
      contribution(1),
      contribution(2),
      buildStateRecord(
        ID,
        { from: "OPEN", to: "CLOSED", reason: "operator" },
        new Date(CLOSE).toISOString(),
      ),
    ]);
    const r = checkFinalize(SETUP, CLOSED, moved, request(RECORDS), NOW);
    expect(r).toMatchObject({ ok: false, refusal: "not-finalizable" });
    expect(problemsOf(r)).toContain(
      "the beacon does not follow the transcript's head: it moved since the download",
    );
    expect(problemsOf(r)).toContain("shield final: final_chain");
  });

  it("refuses a beacon whose chain value is not its own", () => {
    const req = request();
    const forged = { ...req, beacon: { ...req.beacon, chain: h(5) } };
    expect(problemsOf(checkFinalize(SETUP, CLOSED, RECORDS, forged, NOW))).toEqual([
      "the beacon's chain value is not its own",
    ]);
  });

  it("refuses another round than the announced one, and a beacon sealed in the future", () => {
    expect(
      problemsOf(checkFinalize(SETUP, CLOSED, RECORDS, request(RECORDS, beaconOf(R1001)), NOW)),
    ).toContain(
      "beacon is the announced drand round, sealed once after all contributions: round 1001, announced 1000",
    );
    const future = request(RECORDS, beaconOf(R1000, NOW + 1));
    expect(problemsOf(checkFinalize(SETUP, CLOSED, RECORDS, future, NOW))).toEqual([
      "the beacon is sealed in the future",
    ]);
  });

  it("refuses finals that miss a circuit or contradict the transcript", () => {
    const req = request();
    expect(problemsOf(checkFinalize(SETUP, CLOSED, RECORDS, { ...req, finals: [] }, NOW))).toEqual([
      "one final record per circuit is required: shield",
    ]);
    const wrong = { ...req.finals[0]!, contributions: 3, cs_hash: h(1, 64) };
    expect(
      problemsOf(checkFinalize(SETUP, CLOSED, RECORDS, { ...req, finals: [wrong] }, NOW)),
    ).toEqual(["shield final: contribution count", "shield final: csHash"]);
  });

  it("refuses a transcript below the minimum, or one whose signatures do not verify", () => {
    const one = chained([contribution(1)]);
    expect(problemsOf(checkFinalize(SETUP, CLOSED, one, request(one), NOW))).toContain(
      "shield: 1 contributions",
    );
    const forged = chained([contribution(1), { ...contribution(2), link_sig: h(7, 65) }]);
    expect(problemsOf(checkFinalize(SETUP, CLOSED, forged, request(forged), NOW))).toEqual([
      "signatures verify; one GitHub account and one wallet per circuit: shield #2: link signature does not verify",
    ]);
  });
});

const wire = () => JSON.parse(JSON.stringify(request())) as unknown;

describe("validateFinalizeRequest", () => {
  it("reads the chained beacon and the finals exactly", () => {
    expect(validateFinalizeRequest(wire())).toEqual(request());
  });

  it.each([
    [
      "an extra field",
      (v: Record<string, unknown>) => ({ ...v, extra: 1 }),
      /finalize: unexpected field/,
    ],
    [
      "a record that is not a beacon",
      (v: Record<string, unknown>) => ({
        ...v,
        beacon: { ...RECORDS[0], prev_chain: h(1), chain: h(2) },
      }),
      /finalize\.beacon: not a beacon record/,
    ],
    [
      "a beacon without its chain values",
      (v: Record<string, unknown>) => {
        const { prev_chain: _, ...beacon } = v.beacon as Record<string, unknown>;
        return { ...v, beacon };
      },
      /finalize\.beacon\.prev_chain/,
    ],
    [
      "a circuit finalized twice",
      (v: Record<string, unknown>) => ({
        ...v,
        finals: [...(v.finals as unknown[]), ...(v.finals as unknown[])],
      }),
      /finalize\.finals: a circuit appears twice/,
    ],
    [
      "no finals",
      (v: Record<string, unknown>) => ({ ...v, finals: [] }),
      /finalize\.finals: fewer than 1 items/,
    ],
    [
      "a final with δ = γ not asserted",
      (v: Record<string, unknown>) => ({
        ...v,
        finals: [{ ...(v.finals as Record<string, unknown>[])[0], delta_neq_gamma: false }],
      }),
      /delta_neq_gamma: must be true/,
    ],
  ])("refuses %s", (_, edit, message) => {
    expect(() => validateFinalizeRequest(edit(wire() as Record<string, unknown>))).toThrow(message);
  });
});
