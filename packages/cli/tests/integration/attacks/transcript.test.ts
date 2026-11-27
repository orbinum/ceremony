/**
 * Attacks on the transcript: dropped, re-rolled, out-of-window or spliced records, and the Rust
 * verifier. A coordinator that skips every contributor yields a key snarkjs accepts, but whose δ is
 * public.
 */
import {
  type Chained,
  type ContributionRecord,
  createSha256,
  type FinalRecord,
} from "@orbinum-ceremony/core";
import { cp } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { layout } from "../../../src/artifacts";
import { runVerify, type VerifyOptions } from "../../../src/commands/verify";
import { ensureDir, hashFile, writeJson } from "../../../src/io";
import { openTranscript } from "../../../src/store";
import { applyBeacon, exportVerificationKey } from "../../../src/tools";
import {
  editJson,
  failedChecks,
  failures,
  finalizedCeremony,
  PTAU_PATH,
  opened,
  rewriteHistory,
  ROUND_1000,
  ROUND_1001,
  RUST_VERIFIER,
  sealRound,
  shieldOnlyCeremony,
  tamperedCopy,
  type TestCeremony,
} from "../../support";

const MIN = "every circuit has at least 2 contributions";
const REWALK = "shield: final zkey embeds the recorded contributions + sealed beacon";
const BEACON = "beacon is the announced drand round, sealed once after all contributions";

describe.skipIf(!PTAU_PATH)("attacks on the transcript", { timeout: 180_000 }, () => {
  const ptau = PTAU_PATH as string;
  let ceremony: TestCeremony;
  const verify = (dir: string): VerifyOptions => ({
    dir,
    announcementSha256: ceremony.announcementSha256,
    network: "local",
    ptau,
    rebuildGenesis: false,
    local: true,
  });

  beforeAll(async () => {
    ceremony = await finalizedCeremony(ptau);
  }, 180_000);

  it("rejects a ceremony with zero contributions (beacon straight onto the genesis)", async () => {
    const forged = await shieldOnlyCeremony(ptau);
    const paths = layout(forged.dir);
    await sealRound(forged.dir, ROUND_1000);
    await ensureDir(paths.final);
    await applyBeacon(
      paths.zkey("shield", 0),
      paths.finalZkey("shield"),
      "beacon",
      ROUND_1000.randomness,
      10,
    );
    await writeJson(
      paths.finalVk("shield"),
      await exportVerificationKey(paths.finalZkey("shield")),
    );
    const store = await openTranscript(forged.dir, (await opened(forged.dir))[0]);
    const final: FinalRecord = {
      circuit: "shield",
      contributions: 0,
      final_zkey_sha256: await hashFile(paths.finalZkey("shield"), createSha256()),
      vk_json_sha256: await hashFile(paths.finalVk("shield"), createSha256()),
      vk_hash: null,
      cs_hash: forged.init.circuits[0]?.cs_hash as string,
      delta_neq_gamma: true,
      final_chain: store.transcript.records.at(-1)?.chain as string,
    };
    store.transcript.finals = [final];
    await store.save();

    const failed = await failedChecks({
      ...verify(forged.dir),
      announcementSha256: forged.announcementSha256,
    });
    expect(failed).toEqual(expect.arrayContaining([MIN, REWALK]));
  });

  it("rejects history rewritten with a valid chain (a contribution dropped)", async () => {
    const copy = await tamperedCopy(ceremony.dir, (d) =>
      rewriteHistory(d, (records) =>
        records.filter((r) => !(r.type === "contribution" && r.index === 2)),
      ),
    );
    expect(await failedChecks(verify(copy))).toEqual(expect.arrayContaining([MIN, REWALK]));
  });

  it("rejects a beacon re-rolled to another valid drand round (chain recomputed)", async () => {
    const copy = await tamperedCopy(ceremony.dir, (d) =>
      rewriteHistory(d, (records) =>
        records.map((r) => (r.type === "beacon" ? ({ ...r, ...ROUND_1001 } as Chained) : r)),
      ),
    );
    expect(await failedChecks(verify(copy))).toEqual(expect.arrayContaining([BEACON, REWALK]));
  });

  it("rejects a contribution recorded outside the announced window", async () => {
    const copy = await tamperedCopy(ceremony.dir, (d) =>
      rewriteHistory(d, (records) =>
        records.map((r) =>
          r.type === "contribution" && r.index === 2
            ? ({
                ...r,
                verified_by: {
                  ...(r as ContributionRecord).verified_by,
                  at: "2030-01-01T00:00:00.000Z",
                },
              } as Chained)
            : r,
        ),
      ),
    );
    expect(await failures(verify(copy))).toContainEqual({
      id: "records belong to this ceremony, inside the announced window",
      status: "fail",
      detail: "shield #2: accepted outside the contribution window",
    });
  });

  it("rejects records of another ceremony spliced in (refused as a document)", async () => {
    const copy = await tamperedCopy(ceremony.dir, (d) =>
      rewriteHistory(d, (records) =>
        records.map((r, i) => (i === 0 ? { ...r, ceremony_id: "other" } : r)),
      ),
    );
    expect(await failures(verify(copy))).toEqual([
      {
        id: "transcript.json is valid",
        status: "fail",
        detail: "transcript.records[0]: belongs to another ceremony",
      },
    ]);
  });

  it("rejects an edited record when the chain is not recomputed", async () => {
    const copy = await tamperedCopy(ceremony.dir, (d) =>
      editJson<{ records: Record<string, unknown>[] }>(layout(d).transcript, (t) => {
        Object.assign(t.records[0] as object, { zkey_name: "mallory" });
      }),
    );
    expect(await failures(verify(copy))).toContainEqual({
      id: "hash chain verifies from the announcement",
      status: "fail",
      detail: "broken at record 0",
    });
  });

  it("rejects a transcript that does not validate at all (unknown record type)", async () => {
    const copy = await tamperedCopy(ceremony.dir, (d) =>
      editJson<{ records: Record<string, unknown>[] }>(layout(d).transcript, (t) => {
        Object.assign(t.records[0] as object, { type: "admin" });
      }),
    );
    expect(await failedChecks(verify(copy))).toEqual(["transcript.json is valid"]);
  });
});

describe.skipIf(!PTAU_PATH || !RUST_VERIFIER)(
  "the independent Rust verifier",
  { timeout: 180_000 },
  () => {
    const ptau = PTAU_PATH as string;
    let ceremony: TestCeremony;
    const verify = (
      dir: string,
      announcementSha256 = ceremony.announcementSha256,
    ): VerifyOptions => ({
      dir,
      announcementSha256,
      network: "local",
      ptau,
      rebuildGenesis: false,
      local: true,
      rustVerifier: RUST_VERIFIER as string,
    });
    const RUST = "shield: independent verifier (Rust, no snarkjs) agrees";

    beforeAll(async () => {
      ceremony = await finalizedCeremony(ptau);
    }, 180_000);

    it("agrees with the transcript on an honest ceremony", async () => {
      const report = await runVerify(verify(ceremony.dir));
      expect(report.checks.find((c) => c.id === RUST)?.status).toBe("pass");
    });

    it("independently rejects a final key with the beacon missing", async () => {
      const copy = await tamperedCopy(ceremony.dir, async (d) => {
        await cp(layout(d).zkey("shield", 2), layout(d).finalZkey("shield"));
        const sha = await hashFile(layout(d).finalZkey("shield"), createSha256());
        await editJson<{ finals: FinalRecord[] }>(layout(d).transcript, (t) => {
          (t.finals[0] as FinalRecord).final_zkey_sha256 = sha;
        });
      });
      expect(await failures(verify(copy))).toContainEqual({
        id: RUST,
        status: "fail",
        detail: expect.not.stringMatching(/^not run/),
      });
    });
  },
);
