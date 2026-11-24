/** The published ceremony directory: one set of keys, each pinned by what names it. SPEC §6.1. */
import { describe, expect, it } from "vitest";
import { CEREMONY_LAYOUT, pinnedFiles, setupFiles } from "../../../src/ceremony/layout";
import { buildFinalRecord, transcriptOf } from "../../../src/ceremony/transcript";
import {
  contentTypeOf,
  finalFiles,
  isFinalFileKey,
  isSetupFileKey,
} from "../../../src/ceremony/layout";
import { FormatError } from "../../../src/primitives/errors";
import { asCircuitName } from "../../../src/primitives/schema";
import { ANNOUNCEMENT_SHA256, chain, contribution, ID, INIT } from "../../support";

describe("published layout (SPEC §6.1)", () => {
  it("places the genesis at index 0 and contributions after it", () => {
    expect(CEREMONY_LAYOUT.zkey("shield", 0)).toBe("genesis/shield.genesis.zkey");
    expect(CEREMONY_LAYOUT.zkey("shield", 3)).toBe("contributions/shield/3.zkey");
    expect(CEREMONY_LAYOUT.ptau).toBe("ptau/powersOfTau28_hez_final_16.ptau");
  });

  it("lists the setup files in upload order, the announcement last", () => {
    expect(setupFiles(INIT)).toEqual([
      "genesis/init.json",
      "r1cs/shield.r1cs",
      "genesis/shield.genesis.zkey",
      "ptau/powersOfTau28_hez_final_16.ptau",
      "ceremony.json",
    ]);
  });

  it("pins every published file to the record that names it", () => {
    const t = transcriptOf(ID, ANNOUNCEMENT_SHA256, chain([contribution(1)]));
    const c = contribution(1);
    expect(pinnedFiles(INIT, t)).toEqual([
      { key: "r1cs/shield.r1cs", sha256: INIT.circuits[0]?.r1cs_sha256 },
      { key: "genesis/shield.genesis.zkey", sha256: INIT.circuits[0]?.genesis_sha256 },
      { key: "contributions/shield/1.zkey", sha256: c.output_sha256 },
      { key: "logs/shield/1.log", sha256: c.verifier_log_sha256 },
    ]);
  });

  it("names no file for a circuit init.json does not have", () => {
    const foreign = { ...contribution(1), circuit: "transfer" as const };
    const t = transcriptOf(ID, ANNOUNCEMENT_SHA256, chain([foreign]));
    t.finals = [
      buildFinalRecord({
        circuit: "transfer",
        contributions: 1,
        finalZkeySha256: "aa".repeat(32),
        vkJsonSha256: "bb".repeat(32),
        vkHash: null,
        csHash: "cc".repeat(64),
        finalChain: "dd".repeat(32),
      }),
    ];
    expect(pinnedFiles(INIT, t).map((f) => f.key)).toEqual([
      "r1cs/shield.r1cs",
      "genesis/shield.genesis.zkey",
    ]);
  });
});

describe("layout helpers", () => {
  it("accepts only well-formed circuit names and setup keys", () => {
    expect(asCircuitName("transfer", "c")).toBe("transfer");
    expect(asCircuitName("private_sweep", "c")).toBe("private_sweep");
    for (const bad of ["../x", "Shield", "", "1x", "a-b", "a".repeat(33), "constructor", 1])
      expect(() => asCircuitName(bad, "c")).toThrow(FormatError);
    for (const key of [
      "ceremony.json",
      "genesis/init.json",
      "r1cs/transfer.r1cs",
      "genesis/unshield.genesis.zkey",
      "r1cs/private_sweep.r1cs",
      "ptau/powersOfTau28_hez_final_16.ptau",
    ]) {
      expect(isSetupFileKey(key)).toBe(true);
    }
    for (const key of [
      "transcript.json",
      "contributions/shield/1.zkey",
      "genesis/../ceremony.json",
      "r1cs/../x.r1cs",
      "genesis/init.genesis.zkey.json",
      "r1cs/constructor.r1cs",
      "",
    ]) {
      expect(isSetupFileKey(key)).toBe(false);
    }
  });

  it("names the final files with the hashes their records pin, and only those keys", () => {
    const final = buildFinalRecord({
      circuit: "unshield",
      contributions: 1,
      finalZkeySha256: "aa".repeat(32),
      vkJsonSha256: "bb".repeat(32),
      vkHash: null,
      csHash: "cc".repeat(64),
      finalChain: "dd".repeat(32),
    });
    expect(finalFiles([final])).toEqual([
      { key: "final/unshield.final.zkey", sha256: "aa".repeat(32) },
      { key: "final/unshield.vk.json", sha256: "bb".repeat(32) },
    ]);
    expect(isFinalFileKey("final/transfer.final.zkey")).toBe(true);
    expect(isFinalFileKey("final/shield.vk.json")).toBe(true);
    expect(isFinalFileKey("final/private_sweep.vk.json")).toBe(true);
    for (const key of [
      "final/X.vk.json",
      "final/a/b.vk.json",
      "final/../ceremony.json",
      "ceremony.json",
      "final/",
    ]) {
      expect(isFinalFileKey(key)).toBe(false);
    }
    expect(isSetupFileKey("final/shield.vk.json")).toBe(false);
  });

  it("serves each file with its media type", () => {
    expect(contentTypeOf("ceremony.json")).toBe("application/json");
    expect(contentTypeOf("logs/shield/1.log")).toBe("text/plain; charset=utf-8");
    expect(contentTypeOf("r1cs/shield.r1cs")).toBe("application/octet-stream");
  });
});
