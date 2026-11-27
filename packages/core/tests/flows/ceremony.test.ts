/**
 * A whole ceremony through core alone, on real zkeys (the multiplier fixture: alice, bob, then a
 * beacon): setup → each upload pre-checked against the head the transcript implies → records
 * built and chained → attestation → close → sealed beacon → the transcript checks pass, and each
 * tampering breaks exactly the check meant to catch it. The fixture's beacon is fixed, not the
 * drand round, so only the chain part of the final is compared.
 */
import { describe, expect, it } from "vitest";
import { buildAnnouncement } from "../../src/ceremony/announcement";
import { roundTime } from "../../src/ceremony/beacon";
import { buildInit, initCircuitOf } from "../../src/ceremony/init";
import { parseSetup } from "../../src/ceremony/setup";
import {
  appendRecord,
  buildAttestationRecord,
  buildBeaconRecord,
  buildContributionRecord,
  type Chained,
  checkFinalizable,
  checkTranscript,
  finalExpectationOf,
  headOf,
  transcriptOf,
} from "../../src/ceremony/transcript";
import { buildAttestationPayload, checkAttestation } from "../../src/coordination/attestation";
import { DRAND, TOOLING } from "../../src/config";
import { readMpcParams } from "../../src/formats/mpc";
import { readR1csHeader } from "../../src/formats/r1cs";
import { serializeJson, utf8 } from "../../src/primitives/encoding";
import { sha256Hex } from "../../src/primitives/hashing";
import { checkFinalEntries, genesisLayoutOf, precheckUpload } from "../../src/verification";
import { contributor, loadR1cs, loadZkey, R1000, signAttestation } from "../support";

const ID = "flow-1";
const CLIENT = { name: "web", version: "1.0.0", commit: "abc1234" };
const ROUND_AT = roundTime(1000) * 1000;
const OPEN = ROUND_AT - 3 * 3600_000;
const CLOSE = ROUND_AT - 3600_000;

function setup() {
  const genesis = loadZkey("0");
  const init = buildInit({
    ceremonyId: ID,
    createdAt: new Date(OPEN - 3600_000).toISOString(),
    circom: "2.2.3",
    circomlib: "2.0.5",
    circomFlags: TOOLING.circomFlags,
    source: { ref: "v0.16.0", commit: "efe10bf3ef1d928c9c209fee4077750334410cfe" },
    circuits: [
      initCircuitOf("shield", { circuitId: 3, ceremonyVersion: 2 }, readR1csHeader(loadR1cs()), {
        r1csSha256: sha256Hex(loadR1cs()),
        genesisSha256: sha256Hex(genesis),
        csHash: readMpcParams(genesis).csHash,
      }),
    ],
  });
  const initText = serializeJson(init);
  const announcement = buildAnnouncement({
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
  });
  return parseSetup(
    {
      announcement: serializeJson(announcement),
      init: initText,
      genesisSizes: { shield: genesis.length },
    },
    ID,
  );
}

function run() {
  const s = setup();
  const genesis = s.init.circuits[0] as (typeof s.init.circuits)[0];
  const records: Chained[] = [];
  const append = (r: Parameters<typeof appendRecord>[2]) =>
    records.push(appendRecord(records, s.chainGenesis, r));

  for (const [k, file] of [
    [1, "1"],
    [2, "2"],
  ] as const) {
    const bytes = loadZkey(file);
    const head = headOf(records, "shield", {
      sha256: genesis.genesis_sha256,
      csHash: genesis.cs_hash,
    });
    const contributionHash = readMpcParams(bytes).entries.at(-1)?.hash as string;
    const claim = {
      inputSha256: head.outputSha256,
      outputSha256: sha256Hex(bytes),
      contributionHash,
      method: "browser" as const,
      client: CLIENT,
    };
    const pre = precheckUpload(bytes, claim, head, genesisLayoutOf(loadZkey("0")));
    if (!pre.ok) throw new Error(`upload ${k}: ${pre.reason}`);
    append(
      buildContributionRecord({
        ceremonyId: ID,
        seq: k,
        circuit: "shield",
        index: pre.index,
        claimed: claim,
        verified: {
          contributionHash: pre.contributionHash,
          zkeyName: pre.name,
          deltaAfter: pre.deltaAfter,
          logSha256: sha256Hex(utf8(`log ${k}`)),
          verifierVersion: "0.1.0",
          snarkjsVersion: "0.7.6",
        },
        contributor: contributor(k, ID),
        at: new Date(OPEN + k * 60_000).toISOString(),
      }),
    );
  }

  const alice = contributor(1, ID);
  const payload = buildAttestationPayload({
    ceremonyId: ID,
    githubId: alice.github_id,
    account: alice.account,
    seq: 1,
    records,
    client: CLIENT,
  });
  expect(
    checkAttestation(
      payload,
      { ceremonyId: ID, githubId: alice.github_id, account: alice.account },
      records,
    ),
  ).toBeNull();
  append(buildAttestationRecord(payload, "eip712", signAttestation(1, payload)));

  expect(checkFinalizable(records, s.init, s.announcement, CLOSE)).toEqual([]);
  append(
    buildBeaconRecord({
      ceremonyId: ID,
      chainHash: DRAND.chainHash,
      round: R1000,
      iterationsExp: s.announcement.beacon.iterations_exp,
      relays: ["https://api.drand.sh", "https://drand.cloudflare.com"],
      sealedAt: new Date(ROUND_AT + 5000).toISOString(),
    }),
  );
  return { s, records };
}

const problems = (s: ReturnType<typeof setup>, records: Chained[]) =>
  checkTranscript(
    transcriptOf(ID, s.announcementSha256, records),
    s.announcement,
    s.announcementSha256,
    s.init,
  )
    .checks.filter((c) => c.problems.length > 0)
    .map((c) => c.id);

describe("a ceremony through core alone", () => {
  it("passes every transcript check, and the final key embeds the recorded chain", () => {
    const { s, records } = run();
    expect(problems(s, records)).toEqual([]);
    const final = readMpcParams(loadZkey("final"));
    const expected = finalExpectationOf(
      records,
      s.init.circuits[0] as (typeof s.init.circuits)[0],
      s.announcement,
      {
        ...(records.at(-1) as Parameters<typeof finalExpectationOf>[3]),
        randomness: "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
      },
    );
    expect(checkFinalEntries(final, expected)).toEqual([]);
  });

  it.each([
    [
      "two records swapped",
      (r: Chained[]) => [r[1], r[0], ...r.slice(2)],
      "hash chain verifies from the announcement",
    ],
    [
      "a contribution dropped",
      (r: Chained[]) => [r[1], ...r.slice(2)],
      "hash chain verifies from the announcement",
    ],
    [
      "the beacon dropped",
      (r: Chained[]) => r.slice(0, -1),
      "beacon is the announced drand round, sealed once after all contributions",
    ],
  ])("catches %s", (_, tamper, check) => {
    const { s, records } = run();
    expect(problems(s, tamper(records) as Chained[])).toContain(check);
  });
});
