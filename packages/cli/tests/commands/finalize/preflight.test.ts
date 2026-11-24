/** Finalize's preflight: every refusal happens before the beacon is sealed (SPEC §2.6). */
import { writeFile } from "node:fs/promises";
import type { ContributionRecord } from "@orbinum-ceremony/core";
import { describe, expect, it } from "vitest";
import { layout } from "../../../src/artifacts";
import { preflight } from "../../../src/commands/finalize/preflight";
import { openTranscript } from "../../../src/store";
import {
  CLOCK,
  opened,
  rejection,
  rewriteHistory,
  type Synthetic,
  syntheticCeremony,
  tamperedCopy,
} from "../../support";

/** Runs preflight on `dir` (a synthetic ceremony, maybe tampered) at `now`. */
async function check(c: Synthetic, dir = c.dir, now = CLOCK.finalize(), packer?: string) {
  const [announcement, init] = await opened(dir);
  const store = await openTranscript(dir, announcement);
  const records = store.transcript.records.length;
  const error = await rejection(
    preflight(dir, init, announcement.value, announcement.sha256, store, now, packer),
  );
  expect(store.transcript.records).toHaveLength(records);
  return error.message;
}

describe("finalize preflight", () => {
  it("requires the vk packer outside local ceremonies, once everything else holds", async () => {
    const c = await syntheticCeremony({ network: "testnet", finalized: false });
    expect(await check(c)).toBe(
      "--vk-packer is required: vk_hash is mandatory outside local ceremonies",
    );
  });

  it("refuses a transcript that fails integrity although its chain verifies", async () => {
    const c = await syntheticCeremony({ finalized: false });
    const copy = await tamperedCopy(c.dir, (d) =>
      rewriteHistory(
        d,
        (records) =>
          records.map((r, i) =>
            i === 0 ? { ...r, client_contribution_hash: "ab".repeat(64) } : r,
          ) as typeof records,
      ),
    );
    expect(await check(c, copy)).toMatch(
      /^not finalizable: per-circuit contributions link genesis → … → head: shield #1: client h_k differs from the verified h_k/,
    );
  });

  it("refuses before close, and a head file other than the recorded one", async () => {
    const c = await syntheticCeremony({ finalized: false });
    expect(await check(c, c.dir, CLOCK.contribute())).toMatch(/contributions are open until/);
    const head = (c.transcript.records.at(-1) as ContributionRecord).index;
    await writeFile(layout(c.dir).zkey("shield", head), "not the head");
    expect(await check(c)).toBe("shield: head zkey differs from the transcript");
  });

  it("refuses a vk packer that is not executable", async () => {
    const c = await syntheticCeremony({ network: "testnet", finalized: false });
    expect(await check(c, c.dir, CLOCK.finalize(), "/nonexistent/pack")).toBe(
      "pack is not an executable file",
    );
  });
});
