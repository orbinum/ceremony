/**
 * `announce`: the root of trust is never rewritten under a chain, its options follow core's rules,
 * and outside local ceremonies the circuits clone is one of the announced repository.
 */
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

const tagged = (tag: string) => [...argv("local").slice(0, 7), tag, ...argv("local").slice(8)];

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

  it("takes only a release tag name for --circuits-tag, before git sees it", () => {
    for (const bad of ["HEAD", "refs/tags/v1", "v1 x", "v1@{0}", "v1..v2", "abcdef0", ".v1"]) {
      expect(() => parseAnnounceOptions(tagged(bad))).toThrow(
        new UsageError("--circuits-tag must be a release tag name"),
      );
    }
    expect(parseAnnounceOptions(tagged("v1.2.3")).circuitsTag).toBe("v1.2.3");
  });

  it("refuses a circuits clone whose origin is not --circuits-url outside local", async () => {
    const c = await syntheticCeremony({ network: "testnet", finalized: false });
    await rm(layout(c.dir).announcement);
    await rm(layout(c.dir).transcript);
    const repo = await mkdtemp(join(tmpdir(), "orbinum-announce-"));
    const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args]);
    try {
      git("init", "-q");
      git("remote", "add", "origin", "https://github.com/orbinum-labs/circuits.git");
      const options = { ...parseAnnounceOptions(argv("testnet")), dir: c.dir, circuitsRepo: repo };
      expect((await rejection(runAnnounce(options))).message).toBe(
        "circuits clone's origin is github.com/orbinum-labs/circuits, not github.com/orbinum/circuits",
      );
      git("remote", "set-url", "origin", "git@github.com:orbinum/circuits.git");
      expect((await rejection(runAnnounce(options))).message).not.toMatch(/origin/);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
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
