/**
 * `contribute-local` with the real ptau: every simulated upload verified like a real one, and
 * cross-checked from r1cs.
 */
import { readFile, rm } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { layout } from "../../../src/artifacts";
import { runContributeLocal } from "../../../src/commands/contribute-local";
import { loadMetrics } from "../../../src/store";
import { CLOCK, PTAU_PATH, shieldOnlyCeremony } from "../../support";

describe.skipIf(!PTAU_PATH)("contribute-local --cross-check-r1cs", { timeout: 180_000 }, () => {
  const ptau = PTAU_PATH as string;

  it("accepts a contribution only when zkvi and the full verify from r1cs agree", async () => {
    const { dir } = await shieldOnlyCeremony(ptau);
    try {
      await runContributeLocal(
        { dir, ptau, contributors: 1, crossCheckR1cs: true },
        CLOCK.contribute,
      );
      const metrics = await loadMetrics(dir);
      expect(metrics["shield/1"]?.ms.verify_from_r1cs).toBeGreaterThan(0);
      const log = await readFile(layout(dir).log("shield", 1), "utf8");
      expect(log).toContain("ZKey Ok!");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("refuses to start, writing nothing, when the r1cs to cross-check against is missing", async () => {
    const { dir } = await shieldOnlyCeremony(ptau);
    try {
      await rm(layout(dir).r1cs("shield"));
      await expect(
        runContributeLocal({ dir, ptau, contributors: 1, crossCheckR1cs: true }, CLOCK.contribute),
      ).rejects.toThrow(/ENOENT/);
      expect((await loadMetrics(dir))["shield/1"]).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
