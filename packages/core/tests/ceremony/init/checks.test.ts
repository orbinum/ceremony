/**
 * init.json against the announcement, the pinned config and the audited release. SPEC §2.1, §6.2.
 */
import { describe, expect, it } from "vitest";
import {
  buildInit,
  checkGenesis,
  checkInitAgainstAnnouncement,
  checkInitAgainstConfig,
  checkMeasuredBounds,
  checkRelease,
  circuitOf,
  circuitsOf,
  initCircuitOf,
  lockedCircomlibOf,
  pinOf,
  readReleaseManifest,
  validateInit,
} from "../../../src/ceremony/init";
import { readMpcParams } from "../../../src/formats/mpc";
import { readR1csHeader } from "../../../src/formats/r1cs";
import { ANNOUNCEMENT, h, INIT, INIT_TEXT, loadR1cs, loadZkey } from "../../support";
import { sha256Hex } from "../../../src/primitives/hashing";
import { utf8 } from "../../../src/primitives/encoding";
import { FormatError } from "../../../src/primitives/errors";

const shield = INIT.circuits[0] as (typeof INIT.circuits)[0];

/** A release manifest with one `shield` entry. */
const manifest = (shieldEntry: unknown) =>
  JSON.stringify({ name: "circuits", circuits: { shield: shieldEntry } });

describe("init.json against what pins it", () => {
  it("is the announced file, of the same ceremony, from the announced commit", () => {
    expect(checkInitAgainstAnnouncement(ANNOUNCEMENT, INIT, sha256Hex(utf8(INIT_TEXT)))).toEqual(
      [],
    );
    expect(checkInitAgainstAnnouncement(ANNOUNCEMENT, INIT, h(9))).toEqual([
      "init.json is not the one ceremony.json announced",
    ]);
    const other = { ...INIT, ceremony_id: "x", source: { ...INIT.source, commit: "0".repeat(40) } };
    expect(checkInitAgainstAnnouncement(ANNOUNCEMENT, other, sha256Hex(utf8(INIT_TEXT)))).toEqual([
      "init.json and ceremony.json name different ceremonies",
      "init.json was not built from the announced circuits commit",
    ]);
  });

  it("matches the pinned ptau and tooling, every circuit inside the ptau", () => {
    expect(checkInitAgainstConfig(INIT)).toEqual([]);
    const bad = {
      ...INIT,
      ptau: { ...INIT.ptau, size: 1 },
      tooling: {
        ...INIT.tooling,
        snarkjs: "0.7.5",
        circom: "2.1.0",
        circom_flags: ["--r1cs", "--O2"],
      },
      circuits: [{ ...shield, domain_power: 17 }],
    };
    expect(checkInitAgainstConfig(bad)).toEqual([
      "ptau is not the pinned file",
      "snarkjs 0.7.5, pinned 0.7.6",
      "circom 2.1.0, pinned 2.2.3",
      "circom flags --r1cs --O2, pinned --r1cs --O1",
      "shield: needs a 2^17 domain, ptau provides 2^16",
    ]);
  });

  it("matches the audited release, the ceremony key one version past its active one", () => {
    expect(checkRelease({ r1csSha256: shield.r1cs_sha256, version: 1 }, shield)).toEqual([]);
    expect(checkRelease({ r1csSha256: h(2), version: 2 }, shield)).toEqual([
      "r1cs is not the one the release published",
      "ceremony version v2, the release's active v2 needs v3",
    ]);
  });

  it("reads the release manifest per circuit, refusing what it cannot read", () => {
    const entry = {
      active_version: 1,
      versions: { "1": { artifacts: { r1cs: { sha256: h(4), size: 9 }, wasm: {} } } },
    };
    const published = readReleaseManifest(manifest(entry));
    expect(published("shield")).toEqual({ version: 1, r1csSha256: h(4) });
    expect(() => published("transfer")).toThrow(/manifest\.circuits\.transfer/);
    expect(() => published("../x")).toThrow(FormatError);
    for (const bad of [
      { ...entry, active_version: 0 },
      { ...entry, active_version: 2 },
      { ...entry, versions: { "1": { artifacts: { r1cs: { sha256: "zz" } } } } },
    ]) {
      expect(() => readReleaseManifest(manifest(bad))("shield")).toThrow(FormatError);
    }
    // The ceremony's next version already published: its key would be a second v2.
    const taken = { ...entry, versions: { ...entry.versions, "2": entry.versions["1"] } };
    expect(() => readReleaseManifest(manifest(taken))("shield")).toThrow(
      "manifest.circuits.shield: v2 is already published, yet v1 is active",
    );
    expect(() => readReleaseManifest("\u001b[31m{")).toThrow("manifest.json: not valid JSON");
    expect(() => readReleaseManifest("[]")).toThrow(FormatError);
  });

  it("reads the circomlib version the lockfile locks", () => {
    const lock =
      "importers:\n  .:\n    dependencies:\n      circomlib:\n        specifier: 2.0.5\n        version: 2.0.5\n";
    expect(lockedCircomlibOf(lock)).toBe("2.0.5");
    expect(() => lockedCircomlibOf("lockfileVersion: '9.0'\n")).toThrow(FormatError);
  });

  it("reads a hostile lockfile in linear time", () => {
    const hostile = `\n circomlib:${" ".repeat(50_000)}\n${"\n ".repeat(50_000)}x`;
    const start = performance.now();
    expect(() => lockedCircomlibOf(hostile)).toThrow(FormatError);
    expect(performance.now() - start).toBeLessThan(1_000);
  });

  it("fits circuits v0.17.1 in the measured bounds, and names what exceeds them (KL-61)", () => {
    const v0171 = [
      { name: "shield", constraints: 736 },
      { name: "unshield", constraints: 17_290 },
      { name: "transfer", constraints: 34_200 },
    ];
    expect(checkMeasuredBounds(v0171)).toEqual([]);
    expect(checkMeasuredBounds([...v0171, { name: "big", constraints: 50_000 }])).toEqual([
      "big: 50000 constraints, the bounds were measured up to 40000",
      "102226 constraints in all, the bounds were measured up to 60000",
    ]);
  });

  it("names its circuits and their pins", () => {
    expect(circuitsOf(INIT)).toEqual(["shield"]);
    expect(pinOf(INIT, "shield", "genesis")).toBe(shield.genesis_sha256);
    expect(pinOf(INIT, "shield", "r1cs")).toBe(shield.r1cs_sha256);
    expect(() => circuitOf(INIT, "transfer")).toThrow("transfer is not in init.json");
  });
});

describe("building init.json", () => {
  it("derives a circuit entry from its r1cs header and refuses a genesis with entries", () => {
    const header = readR1csHeader(loadR1cs());
    const c = initCircuitOf("shield", { circuitId: 3, ceremonyVersion: 2 }, header, {
      r1csSha256: h(1),
      genesisSha256: h(2),
      csHash: h(3, 64),
    });
    expect(c).toMatchObject({
      circuit_id: 3,
      ceremony_version: 2,
      constraints: header.constraints,
      public_signals: header.publicOutputs + header.publicInputs,
      wires: header.wires,
      genesis_sha256: h(2),
    });
    expect(checkGenesis(readMpcParams(loadZkey("0")))).toEqual([]);
    expect(checkGenesis(readMpcParams(loadZkey("1")))).toEqual(["genesis has 1 MPC entries"]);
  });

  it.each([
    ["no circuit", { circuits: [] }, /init\.circuits: fewer than 1/],
    [
      "a ref that reads as an option",
      { source: { ...INIT.source, ref: "--upload-pack=x" } },
      /init\.source\.ref/,
    ],
    [
      "uppercase hex",
      { circuits: [{ ...shield, genesis_sha256: "AB".repeat(32) }] },
      /genesis_sha256/,
    ],
    ["a domain beyond 2^28", { circuits: [{ ...shield, domain_power: 29 }] }, /domain_power/],
    [
      "more than 8 circom flags",
      { tooling: { ...INIT.tooling, circom_flags: Array(9).fill("--O1") } },
      /circom_flags/,
    ],
    [
      "an unexpected nested field",
      { ptau: { ...INIT.ptau, url: "x" } },
      /init\.ptau: unexpected field/,
    ],
  ])("refuses %s", (_, patch, message) => {
    expect(() => validateInit({ ...INIT, ...patch })).toThrow(message);
  });

  it("builds a valid init pinned to the config", () => {
    expect(
      buildInit({
        ceremonyId: "x-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        circom: "2.2.3",
        circomlib: "2.0.5",
        circomFlags: ["--r1cs"],
        source: INIT.source,
        circuits: INIT.circuits,
      }).ptau.file,
    ).toBe("powersOfTau28_hez_final_16.ptau");
  });
});
