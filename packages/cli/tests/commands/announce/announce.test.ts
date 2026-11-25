/**
 * `announce`: the root of trust is never rewritten under a chain, and its options follow core's
 * rules (SPEC §5.2, §6.2).
 */
import { readFile } from "node:fs/promises";
import {
  CIRCUITS_REPO_URL,
  MAX_CONTRIBUTIONS,
  MAX_INVITED,
  MIN_BEACON_DELAY_SECONDS,
} from "@orbinum-ceremony/core";
import { describe, expect, it } from "vitest";
import { UsageError } from "../../../src/args";
import { layout } from "../../../src/artifacts";
import { parseAnnounceOptions, runAnnounce } from "../../../src/commands/announce";
import { rejection, syntheticCeremony } from "../../support";

const argv = (network: string, ...extra: string[]) => [
  "--dir",
  "d",
  "--network",
  network,
  "--circuits-repo",
  "r",
  "--circuits-tag",
  "v1",
  "--min-contributions",
  "2",
  "--close",
  "2030-01-01T00:00:00Z",
  ...extra,
];

/** The local argv with another minimum. */
const withMinimum = (n: number) => [
  ...argv("local").slice(0, 9),
  String(n),
  ...argv("local").slice(10),
];

describe("announce", () => {
  it("never rewrites ceremony.json, and never under a transcript even with --force", async () => {
    const c = await syntheticCeremony({ finalized: false });
    const before = await readFile(layout(c.dir).announcement);
    const options = parseAnnounceOptions(argv("local", "--force"));
    const run = (force: boolean) => runAnnounce({ ...options, dir: c.dir, force });
    expect((await rejection(run(false))).message).toMatch(/^ceremony\.json already exists/);
    expect((await rejection(run(true))).message).toBe(
      "transcript.json exists: the announcement it is anchored in cannot change",
    );
    expect(await readFile(layout(c.dir).announcement)).toEqual(before);
  });

  it("refuses a beacon delay below the network's minimum", () => {
    for (const network of ["testnet", "mainnet"] as const) {
      const min = MIN_BEACON_DELAY_SECONDS[network];
      expect(() => parseAnnounceOptions(argv(network, "--beacon-delay", String(min - 1)))).toThrow(
        new UsageError(`--beacon-delay must be an integer from ${min} to 31536000`),
      );
      expect(
        parseAnnounceOptions(argv(network, "--beacon-delay", String(min))).beaconDelaySeconds,
      ).toBe(min);
    }
    expect(parseAnnounceOptions(argv("local", "--beacon-delay", "0")).beaconDelaySeconds).toBe(0);
  });

  it("names the audited circuits repo outside local ceremonies", () => {
    const lookalike = ["--circuits-url", "https://github.com/orbinum-labs/circuits"];
    expect(() => parseAnnounceOptions(argv("testnet", ...lookalike))).toThrow(
      new UsageError(`--circuits-url must be ${CIRCUITS_REPO_URL} on testnet`),
    );
    expect(parseAnnounceOptions(argv("local", ...lookalike)).circuitsUrl).toBe(lookalike[1]);
    expect(parseAnnounceOptions(argv("mainnet")).circuitsUrl).toBe(CIRCUITS_REPO_URL);
  });

  it("bounds the minimum by what a zkey can hold", () => {
    expect(parseAnnounceOptions(withMinimum(MAX_CONTRIBUTIONS)).minContributions).toBe(
      MAX_CONTRIBUTIONS,
    );
    expect(() => parseAnnounceOptions(withMinimum(MAX_CONTRIBUTIONS + 1))).toThrow(
      new UsageError(`--min-contributions must be an integer from 1 to ${MAX_CONTRIBUTIONS}`),
    );
  });

  it("announces no invitations unless --invite lists them", () => {
    expect(parseAnnounceOptions(argv("testnet")).admission).toBeUndefined();
    expect(parseAnnounceOptions(argv("testnet", "--invite", "30, 10,30")).admission).toEqual({
      mode: "open",
      invited: [30, 10],
    });
  });

  it("closes a rehearsal to the invited accounts, never mainnet", () => {
    expect(parseAnnounceOptions(argv("testnet", "--invite", "1,2", "--closed")).admission).toEqual({
      mode: "closed",
      invited: [1, 2],
    });
    expect(() => parseAnnounceOptions(argv("testnet", "--closed"))).toThrow(
      new UsageError("--closed needs --invite: the accounts that may join"),
    );
    expect(() => parseAnnounceOptions(argv("mainnet", "--invite", "1,2", "--closed"))).toThrow(
      new UsageError("--closed is for rehearsals, never mainnet"),
    );
    expect(() => parseAnnounceOptions(argv("local", "--invite", "1,1", "--closed"))).toThrow(
      new UsageError("--closed needs at least --min-contributions (2) invited accounts"),
    );
  });

  it("takes only numeric GitHub ids, at most the announced bound", () => {
    for (const bad of ["octocat", "1,,2", "0", "1.5", "0x10", "", "99999999999999999"]) {
      expect(() => parseAnnounceOptions(argv("testnet", "--invite", bad))).toThrow(
        new UsageError("--invite must list numeric GitHub ids, comma-separated"),
      );
    }
    const many = Array.from({ length: MAX_INVITED + 1 }, (_, i) => i + 1).join(",");
    expect(() => parseAnnounceOptions(argv("testnet", "--invite", many))).toThrow(
      new UsageError(`--invite lists more than ${MAX_INVITED} accounts`),
    );
  });
});
