/**
 * Attacks on drand round selection, the relay quorum and the beacon seal (SPEC §2.6, §5, KL-42).
 */
import { existsSync } from "node:fs";
import { chmod, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildAnnouncement,
  CIRCUITS_REPO_URL,
  DRAND,
  relayQuorum,
  roundAt,
  roundTime,
  serializeJson,
  type Transcript,
  validateAnnouncement,
  verifyDrandRound,
} from "@orbinum-ceremony/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { layout } from "../../../src/artifacts";
import { runFinalize } from "../../../src/commands/finalize";
import { fetchJson } from "../../../src/io";
import {
  CLOCK,
  localServer,
  PTAU_PATH,
  rejection,
  rewriteHistory,
  ROUND_1000,
  ROUND_1001,
  syntheticCeremony,
} from "../../support";

afterEach(() => vi.unstubAllGlobals());

const flip = (hex: string) => (hex[0] === "a" ? "b" : "a") + hex.slice(1);
const relays = (bodies: unknown[]) =>
  bodies.map((body, i) => ({ relay: DRAND.relays[i] as string, body }));

describe("round selection R = ceil((T_beacon − genesis)/period) + 1", () => {
  it("is the first round emitted at or after T_beacon, at every boundary", () => {
    const g = DRAND.genesisTime;
    const p = DRAND.periodSeconds;
    for (const k of [0, 1, 2, 1000, 12_345_678]) {
      const exact = g + k * p;
      expect(roundAt(exact)).toBe(k + 1);
      expect(roundTime(roundAt(exact))).toBe(exact);
      for (const d of [0.001, 1, p - 0.001]) {
        const t = exact + d;
        const r = roundAt(t);
        expect(roundTime(r)).toBeGreaterThanOrEqual(t);
        expect(roundTime(r - 1)).toBeLessThan(t);
      }
    }
    expect(roundAt(g - 100)).toBe(1);
  });

  it("refuses an announcement whose round is off by one either way", () => {
    const a = buildAnnouncement({
      ceremonyId: "attack-round",
      network: "testnet",
      initSha256: "00".repeat(32),
      circuitsSource: { repo: CIRCUITS_REPO_URL, tag: "v1.0.0", commit: "a".repeat(40) },
      minContributions: 1,
      open: new Date("2026-10-01T00:00:00.000Z"),
      close: new Date("2026-10-02T00:00:00.000Z"),
      beaconDelaySeconds: 3601,
    });
    const v = JSON.parse(serializeJson(a)) as typeof a;
    expect(validateAnnouncement(v).beacon.round).toBe(a.beacon.round);
    for (const round of [a.beacon.round - 1, a.beacon.round + 1]) {
      expect(() => validateAnnouncement({ ...v, beacon: { ...v.beacon, round } })).toThrow(
        /not the first round/,
      );
    }
  });
});

describe("drand round verification and relay quorum", () => {
  it("rejects an invalid BLS signature and randomness ≠ SHA-256(signature)", () => {
    expect(verifyDrandRound(ROUND_1000)).toBe(true);
    expect(verifyDrandRound({ ...ROUND_1000, signature: flip(ROUND_1000.signature) })).toBe(false);
    expect(verifyDrandRound({ ...ROUND_1000, randomness: flip(ROUND_1000.randomness) })).toBe(
      false,
    );
    expect(verifyDrandRound({ ...ROUND_1001, round: 1000 })).toBe(false);
    expect(verifyDrandRound({ ...ROUND_1000, signature: `${ROUND_1000.signature}00` })).toBe(false);
    expect(verifyDrandRound({ ...ROUND_1000, round: 2 ** 64 } as never)).toBe(false);
  });

  it("needs two relays agreeing on a valid round; hostile answers neither change nor block it", () => {
    const hostile = [
      { ...ROUND_1001 }, // another valid round
      { ...ROUND_1000, round: "1000" }, // wrong type
      { ...ROUND_1000, signature: flip(ROUND_1000.signature) },
      "x".repeat(100),
      null,
      [ROUND_1000],
    ];
    for (const bad of hostile) {
      const r = relayQuorum(1000, relays([ROUND_1000, bad, ROUND_1000, bad]));
      expect(r.ok && r.value.signature).toBe(ROUND_1000.signature);
      expect(relayQuorum(1000, relays([ROUND_1000, bad, bad, bad])).ok).toBe(false);
    }
    // Upper-case hex from a relay is the same value.
    const upper = {
      ...ROUND_1000,
      signature: ROUND_1000.signature.toUpperCase(),
      randomness: ROUND_1000.randomness.toUpperCase(),
    };
    const r = relayQuorum(1000, relays([upper, ROUND_1000]));
    expect(r.ok && r.value.signature).toBe(ROUND_1000.signature);
  });

  it("counts relays by the name asked, not by an independent source", () => {
    // One relay echoing another counts twice: the quorum is for availability only, the value is
    // fixed by the BLS signature.
    const r = relayQuorum(1000, [
      { relay: DRAND.relays[0] as string, body: ROUND_1000 },
      { relay: DRAND.relays[1] as string, body: structuredClone(ROUND_1000) },
    ]);
    expect(r.ok).toBe(true);
  });

  it("refuses a relay body over 64 KiB, and a redirect to file://", async () => {
    const s = await localServer({
      "/big": (_q, res) => res.writeHead(200).end(`{"pad":"${"x".repeat(70_000)}"}`),
      "/file": (_q, res) => res.writeHead(302, { location: "file:///etc/hosts" }).end(),
    });
    try {
      await expect(fetchJson(`${s.url}/big`)).rejects.toThrow(/larger than 65536/);
      await expect(fetchJson(`${s.url}/file`)).rejects.toThrow(/fetch failed/);
    } finally {
      await s.close();
    }
  });
});

describe.skipIf(!PTAU_PATH)(
  "finalize: preflight before sealing, and the sealed value reused",
  {
    timeout: 120_000,
  },
  () => {
    it("never seals on a failed preflight; once sealed, re-runs never ask drand again", async () => {
      const c = await syntheticCeremony({ network: "testnet", finalized: false });
      const calls: string[] = [];
      let answer: unknown = ROUND_1000;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          calls.push(url);
          return new Response(JSON.stringify(answer), { status: 200 });
        }),
      );
      const before = await readFile(layout(c.dir).transcript, "utf8");

      // 1. No vk packer on testnet: refused before sealing; drand never asked.
      const noPacker = await rejection(
        runFinalize({ dir: c.dir, ptau: PTAU_PATH as string }, CLOCK.finalize),
      );
      expect(noPacker.message).toMatch(/--vk-packer is required/);
      expect(calls).toEqual([]);
      expect(await readFile(layout(c.dir).transcript, "utf8")).toBe(before);

      // 2. Before the round is emitted: refused, drand never asked.
      const packer = join(c.dir, "packer.sh");
      await writeFile(packer, "#!/bin/sh\nexit 1\n");
      await chmod(packer, 0o755);
      const early = await rejection(
        runFinalize({ dir: c.dir, ptau: PTAU_PATH as string, vkPacker: packer }, CLOCK.afterClose),
      );
      expect(early.message).toMatch(/not finalizable|emitted at/);
      expect(calls).toEqual([]);

      // 3. Seals, then fails applying the beacon to the fake key: sealed, final/ untouched.
      await expect(
        runFinalize({ dir: c.dir, ptau: PTAU_PATH as string, vkPacker: packer }, CLOCK.finalize),
      ).rejects.toThrow(/Invalid File format/);
      expect(calls).toHaveLength(DRAND.relays.length);
      const sealed = JSON.parse(await readFile(layout(c.dir).transcript, "utf8")) as Transcript;
      expect(sealed.records.at(-1)).toMatchObject({ type: "beacon", round: 1000 });
      expect(existsSync(layout(c.dir).final)).toBe(false);

      // 4. Relays now lie (another valid round): the re-run reuses the sealed value, asks nobody.
      answer = { ...ROUND_1001, round: 1000 };
      calls.length = 0;
      await expect(
        runFinalize({ dir: c.dir, ptau: PTAU_PATH as string, vkPacker: packer }, CLOCK.finalize),
      ).rejects.toThrow(/Invalid File format/);
      expect(calls).toEqual([]);
      const again = JSON.parse(await readFile(layout(c.dir).transcript, "utf8")) as Transcript;
      expect(again.records.filter((r) => r.type === "beacon")).toHaveLength(1);
      expect(again.records.at(-1)).toMatchObject({ randomness: ROUND_1000.randomness });

      // 5. A sealed beacon swapped for another valid round (chain recomputed) is refused, no fetch.
      await rewriteHistory(c.dir, (records) =>
        records.map((r) => (r.type === "beacon" ? { ...r, ...ROUND_1001 } : r)),
      );
      const swapped = await rejection(
        runFinalize({ dir: c.dir, ptau: PTAU_PATH as string, vkPacker: packer }, CLOCK.finalize),
      );
      expect(swapped.message).toMatch(/the sealed beacon is not valid: round 1001, announced 1000/);
      expect(calls).toEqual([]);
      await rm(c.dir, { recursive: true, force: true });
    });
  },
);
