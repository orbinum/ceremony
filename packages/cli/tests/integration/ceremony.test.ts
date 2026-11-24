/**
 * A local shield ceremony with the real ptau: contribute, finalize, verify, and the operator
 * guards.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { runContributeLocal } from "../../src/commands/contribute-local";
import { runFinalize } from "../../src/commands/finalize";
import type { VerifyOptions } from "../../src/commands/verify";
import {
  CLOCK,
  failedChecks,
  finalizedCeremony,
  PTAU_PATH,
  shieldOnlyCeremony,
  type TestCeremony,
} from "../support";

describe.skipIf(!PTAU_PATH)("local ceremony end to end (shield)", { timeout: 180_000 }, () => {
  const ptau = PTAU_PATH as string;
  let ceremony: TestCeremony;
  let verify: VerifyOptions;

  beforeAll(async () => {
    ceremony = await finalizedCeremony(ptau);
    verify = {
      dir: ceremony.dir,
      announcementSha256: ceremony.announcementSha256,
      network: "local",
      ptau,
      rebuildGenesis: true,
      local: true,
    };
  }, 180_000);

  it("verifies everything: a ceremony may cover any circuits of the release", async () => {
    expect(await failedChecks(verify)).toEqual([]);
  });

  it("re-running finalize reuses the sealed beacon and produces the same keys", async () => {
    const finals = await runFinalize({ dir: ceremony.dir, ptau }, CLOCK.finalize);
    expect(finals.map((f) => f.contributions)).toEqual([2]);
    expect(await failedChecks(verify)).toEqual([]);
  });

  it("refuses contributions after the seal", async () => {
    await expect(
      runContributeLocal(
        { dir: ceremony.dir, ptau, contributors: 1, crossCheckR1cs: false },
        CLOCK.contribute,
      ),
    ).rejects.toThrow(/sealed/);
  });

  it("refuses verification without the right pin or mode", async () => {
    expect(await failedChecks({ ...verify, announcementSha256: "00".repeat(32) })).toEqual([
      "ceremony.json matches the pinned SHA-256",
    ]);
    expect(await failedChecks({ ...verify, local: false })).toEqual([
      "verification mode matches the announced network",
    ]);
  });
});

describe.skipIf(!PTAU_PATH)("operator guards", { timeout: 120_000 }, () => {
  const ptau = PTAU_PATH as string;

  it("refuses contributions outside the announced window", async () => {
    const { dir } = await shieldOnlyCeremony(ptau);
    const opts = { dir, ptau, contributors: 1, crossCheckR1cs: false };
    await expect(runContributeLocal(opts, CLOCK.afterClose)).rejects.toThrow(/closed/);
    await expect(runContributeLocal(opts, () => new Date(0))).rejects.toThrow(/open at/);
  });

  it("refuses to finalize before closing, or below the minimum, without sealing anything", async () => {
    const { dir } = await shieldOnlyCeremony(ptau);
    await runContributeLocal(
      { dir, ptau, contributors: 1, crossCheckR1cs: false },
      CLOCK.contribute,
    );
    await expect(runFinalize({ dir, ptau }, CLOCK.contribute)).rejects.toThrow(/open until/);
    await expect(runFinalize({ dir, ptau }, CLOCK.finalize)).rejects.toThrow(
      /not finalizable: shield: 1 contributions/,
    );
    // Nothing irreversible happened: a second contributor can still join.
    await runContributeLocal(
      { dir, ptau, contributors: 1, crossCheckR1cs: false },
      CLOCK.contribute,
    );
  });
});
