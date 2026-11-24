/**
 * `init` refuses to rebuild a ceremony anything builds on, before touching any tool (SPEC §2.1).
 */
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { layout } from "../../../src/artifacts";
import { runInit } from "../../../src/commands/init";
import { rejection, syntheticCeremony } from "../../support";

const options = (out: string, force: boolean) => ({
  ceremonyId: "synthetic-local",
  circuitsRepo: "/nonexistent",
  circuitsRef: "v1.0.0",
  circuits: [{ name: "shield", circuitId: 3 }],
  out,
  ptau: "/nonexistent.ptau",
  checkDeterminism: false,
  force,
  beyondMeasuredBounds: false,
});

describe("init over an existing ceremony", () => {
  it("never rebuilds under contributions, even with init.json gone and --force", async () => {
    const c = await syntheticCeremony({ finalized: false });
    await rm(layout(c.dir).init);
    await rm(layout(c.dir).transcript);
    for (const force of [false, true]) {
      // oxlint-disable-next-line no-await-in-loop -- two calls
      expect((await rejection(runInit(options(c.dir, force)))).message).toBe(
        `${c.dir} already has contributions: it cannot be rebuilt`,
      );
    }
  });

  it("looks past stray files under contributions/ and still finds the contributions", async () => {
    const c = await syntheticCeremony({ finalized: false });
    await rm(layout(c.dir).init);
    await rm(layout(c.dir).transcript);
    await writeFile(join(c.dir, "contributions", ".DS_Store"), "x");
    expect((await rejection(runInit(options(c.dir, true)))).message).toBe(
      `${c.dir} already has contributions: it cannot be rebuilt`,
    );
    await rm(layout(c.dir).contributions("shield"), { recursive: true });
    await rm(layout(c.dir).announcement);
    expect((await rejection(runInit(options(c.dir, true)))).message).not.toMatch(
      /contributions|announced|--force|ENOTDIR/,
    );
  });

  it("never rebuilds an announced ceremony, whose init.json ceremony.json pins", async () => {
    const c = await syntheticCeremony({ finalized: false });
    await rm(layout(c.dir).transcript);
    await rm(layout(c.dir).contributions("shield"), { recursive: true });
    const init = await readFile(layout(c.dir).init);
    expect((await rejection(runInit(options(c.dir, true)))).message).toMatch(
      /is announced: ceremony\.json pins its init\.json/,
    );
    expect(await readFile(layout(c.dir).init)).toEqual(init);
  });

  it("rebuilds an unannounced one only with --force", async () => {
    const c = await syntheticCeremony({ finalized: false });
    await rm(layout(c.dir).transcript);
    await rm(layout(c.dir).contributions("shield"), { recursive: true });
    await rm(layout(c.dir).announcement);
    expect((await rejection(runInit(options(c.dir, false)))).message).toMatch(/pass --force/);
    // With --force the guards pass and the build starts (and stops: no circom, or no ptau).
    expect((await rejection(runInit(options(c.dir, true)))).message).not.toMatch(
      /contributions|announced|--force/,
    );
  });
});
