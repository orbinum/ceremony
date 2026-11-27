/** verify and contribute-local against hostile files, slow tools and the wrong network. */
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import {
  type CeremonyAnnouncement,
  MIN_BEACON_DELAY_SECONDS,
  serializeJson,
  sha256Utf8,
  type Transcript,
} from "@orbinum-ceremony/core";
import { beforeAll, describe, expect, it } from "vitest";
import { layout } from "../../../src/artifacts";
import { runContributeLocal } from "../../../src/commands/contribute-local";
import { runVerify, type VerifyOptions } from "../../../src/commands/verify";
import {
  CLOCK,
  editJson,
  failures,
  finalizedCeremony,
  PTAU_PATH,
  rewriteHistory,
  shieldOnlyCeremony,
  tamperedCopy,
  type TestCeremony,
} from "../../support";

describe.skipIf(!PTAU_PATH)("verify and contribute-local, hardened", { timeout: 180_000 }, () => {
  const ptau = PTAU_PATH as string;
  let ceremony: TestCeremony;
  const verify = (dir: string, extra: Partial<VerifyOptions> = {}): VerifyOptions => ({
    dir,
    announcementSha256: ceremony.announcementSha256,
    network: "local",
    ptau,
    rebuildGenesis: false,
    local: true,
    ...extra,
  });

  beforeAll(async () => {
    ceremony = await finalizedCeremony(ptau);
  }, 180_000);

  it("prints nothing a published file can use to rewrite the terminal", async () => {
    const copy = await tamperedCopy(ceremony.dir, (d) =>
      writeFile(layout(d).transcript, "\u001b[2K\u001b[1A✓ 52 passed, 0 failed {"),
    );
    const report = await runVerify(verify(copy));
    expect(report.render().includes("\u001b")).toBe(false);
    expect(report.checks).toContainEqual({
      id: "transcript.json is valid",
      status: "fail",
      detail: "transcript.json: not valid JSON",
    });
    expect(JSON.stringify(report.checks)).not.toContain(copy);
  });

  it("does not run snarkjs on a final key already known not to be the recorded one", async () => {
    const copy = await tamperedCopy(ceremony.dir, (d) =>
      writeFile(layout(d).finalZkey("shield"), new Uint8Array(4096)),
    );
    const failed = await failures(verify(copy));
    const gated = "not run: prerequisite failed (shield: final zkey matches the final record)";
    for (const id of [
      "shield: final zkey verifies from r1cs + ptau",
      "shield: published vk.json = VK exported from the final zkey",
      "shield: δ ≠ γ and δ ≠ genesis δ",
    ]) {
      expect(failed).toContainEqual({ id, status: "fail", detail: gated });
    }
  });

  it("bounds every snarkjs call: one that outlives its limit fails, and the run finishes", async () => {
    const failed = await failures(verify(ceremony.dir, { snarkjsLimits: { timeoutMs: 1 } }));
    expect(failed).toContainEqual({
      id: "shield: final zkey verifies from r1cs + ptau",
      status: "fail",
      detail: "timed out after 0.001 s",
    });
  });

  it("fails a mainnet transcript built from simulated contributions", async () => {
    let sha = "";
    const copy = await tamperedCopy(ceremony.dir, async (d) => {
      const paths = layout(d);
      let mainnet: CeremonyAnnouncement | undefined;
      await editJson<CeremonyAnnouncement>(paths.announcement, (a) => {
        const close = Date.parse(a.schedule.beacon) - MIN_BEACON_DELAY_SECONDS.mainnet * 1000;
        a.network = "mainnet";
        a.min_contributions = 50;
        a.schedule.close = new Date(close).toISOString();
        a.schedule.open = new Date(close - 3600_000).toISOString();
        mainnet = a;
      });
      const text = serializeJson(mainnet as CeremonyAnnouncement);
      await writeFile(paths.announcement, text);
      sha = sha256Utf8(text);
      await editJson<Transcript>(paths.transcript, (t) => {
        t.anchor.sha256 = sha;
      });
      await rewriteHistory(d, (records) => records);
    });
    const failed = await failures(
      verify(copy, { announcementSha256: sha, network: "mainnet", local: false }),
    );
    expect(failed).toContainEqual({
      id: "no simulated contributions on mainnet",
      status: "fail",
      detail:
        "shield #1: simulated contribution on mainnet; shield #2: simulated contribution on mainnet",
    });
  });

  it("refuses to simulate contributors outside a rehearsal", async () => {
    const mainnet = await shieldOnlyCeremony(ptau, "mainnet", 50);
    await expect(
      runContributeLocal(
        { dir: mainnet.dir, ptau, contributors: 1, crossCheckR1cs: false },
        CLOCK.contribute,
      ),
    ).rejects.toThrow("simulated contributions are for rehearsals; this is a mainnet ceremony");
  });

  it("does not accept a contribution whose record would fall after the close", async () => {
    const late = await shieldOnlyCeremony(ptau);
    const times = [CLOCK.contribute(), CLOCK.afterClose()];
    const clock = () => times.shift() ?? CLOCK.afterClose();
    await expect(
      runContributeLocal({ dir: late.dir, ptau, contributors: 1, crossCheckR1cs: false }, clock),
    ).rejects.toThrow(/contributions closed at/);
    expect(existsSync(layout(late.dir).zkey("shield", 1))).toBe(false);
    expect(existsSync(layout(late.dir).log("shield", 1))).toBe(false);
  });
});
