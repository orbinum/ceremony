/**
 * snarkjs operations in a child process, hermetic (no ptau): their answers, the shape every answer
 * must have, and the bounds a call runs under (a tighter override, such as what is left of a
 * deadline, still wins).
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readMpcParams } from "@orbinum-ceremony/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IsolationError, LIMITS } from "../../src/isolate";
import { applyBeacon, contribute, exportVerificationKey } from "../../src/snarkjs";
import { limitsFor, PER_ENTRY_MS, REPLY_CHECKS } from "../../src/snarkjs/worker";

const FX = join(import.meta.dirname, "..", "fixtures");
const GENESIS = join(FX, "multiplier_0.zkey");
const BEACON = "ab".repeat(32);

const params = async (path: string) => readMpcParams(new Uint8Array(await readFile(path)));

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "orbinum-snarkjs-isolated-"));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe("snarkjs operations in a child process", { timeout: 60_000 }, () => {
  it("contribute returns h_k: the new zkey's last entry", async () => {
    const out = join(dir, "c1.zkey");
    const hash = await contribute(GENESIS, out, "tester", "some entropy");
    const { entries } = await params(out);
    expect(entries).toHaveLength(1);
    expect(entries.at(-1)).toMatchObject({ kind: "contribution", hash, name: "tester" });
  });

  it("applies a beacon, and refuses parameters snarkjs rejects", async () => {
    const out = join(dir, "b.zkey");
    await applyBeacon(GENESIS, out, "final", BEACON, 10);
    expect((await params(out)).entries.at(-1)).toMatchObject({
      kind: "beacon",
      numIterationsExp: 10,
    });
    const refused = await applyBeacon(GENESIS, join(dir, "b2.zkey"), "final", BEACON, 9).catch(
      (e: unknown) => e,
    );
    expect(refused).not.toBeInstanceOf(IsolationError);
    expect(refused).toMatchObject({ message: "snarkjs refused the beacon parameters" });
  });

  it("export on a garbage file is the file's error, not an isolation failure", async () => {
    const garbage = join(dir, "garbage.zkey");
    await writeFile(garbage, "this is not a zkey at all");
    const error = await exportVerificationKey(garbage).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(IsolationError);
    expect((error as Error).message).not.toBe("");
  });

  it("carries the child's error code to the caller", async () => {
    const error = await exportVerificationKey(join(dir, "missing.zkey")).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(IsolationError);
    expect(error).toMatchObject({ code: "ENOENT" });
  });
});

describe("the shape of an answer", () => {
  it.each([
    ["true, logged", { ok: true, log: "ZKey Ok!" }, true],
    ["false, logged", { ok: false, log: "" }, true],
    ["a truthy non-boolean ok", { ok: "true", log: "ZKey Ok!" }, false],
    ["ok without a log", { ok: true }, false],
    ["a log that is not text", { ok: true, log: ["ZKey Ok!"] }, false],
    ["an array", [true, "ZKey Ok!"], false],
    ["null", null, false],
    ["the bare boolean true", true, false],
  ])("a verify outcome that is %s: accepted %s", (_, value, accepted) => {
    expect(REPLY_CHECKS.verifyFromInit(value)).toBe(accepted);
    expect(REPLY_CHECKS.verifyFromR1cs(value)).toBe(accepted);
  });

  it("h_k must be 64 bytes of lowercase hex", () => {
    expect(REPLY_CHECKS.contribute("ab".repeat(64))).toBe(true);
    for (const v of ["AB".repeat(64), "ab".repeat(63), `${"ab".repeat(64)}0`, 1, null]) {
      expect(REPLY_CHECKS.contribute(v)).toBe(false);
    }
  });

  it("void operations answer nothing, and a key is an object", () => {
    expect(REPLY_CHECKS.applyBeacon(undefined)).toBe(true);
    expect(REPLY_CHECKS.applyBeacon(true)).toBe(false);
    expect(REPLY_CHECKS.exportVerificationKey({ protocol: "groth16" })).toBe(true);
    expect(REPLY_CHECKS.exportVerificationKey([])).toBe(false);
  });
});

describe("bounds of a call", () => {
  it("are the class bounds by default", () => {
    expect(limitsFor("verifyFromInit")).toEqual(LIMITS.medium);
    expect(limitsFor("verifyFromR1cs")).toEqual(LIMITS.heavy);
    expect(limitsFor("exportVerificationKey")).toEqual(LIMITS.light);
  });

  it("an override only lowers them, per bound", () => {
    expect(limitsFor("verifyFromInit", { timeoutMs: 5_000 })).toEqual({
      ...LIMITS.medium,
      timeoutMs: 5_000,
    });
    expect(
      limitsFor("verifyFromInit", {
        timeoutMs: 10 ** 9,
        maxRssBytes: 2 * LIMITS.medium.maxRssBytes,
      }),
    ).toEqual(LIMITS.medium);
    expect(limitsFor("verifyFromR1cs", { maxRssBytes: 1024 ** 3, timeoutMs: 10 ** 9 })).toEqual({
      timeoutMs: LIMITS.heavy.timeoutMs,
      maxRssBytes: 1024 ** 3,
    });
  });

  it("grow a verification's time with the MPC entries it re-walks, and nothing else's", () => {
    expect(limitsFor("verifyFromInit", undefined, 4_500)).toEqual({
      ...LIMITS.medium,
      timeoutMs: LIMITS.medium.timeoutMs + 4_500 * PER_ENTRY_MS,
    });
    expect(limitsFor("verifyFromR1cs", undefined, 100).timeoutMs).toBe(
      LIMITS.heavy.timeoutMs + 100 * PER_ENTRY_MS,
    );
    expect(limitsFor("exportVerificationKey", undefined, 4_500)).toEqual(LIMITS.light);
    expect(limitsFor("verifyFromInit", undefined, -5)).toEqual(LIMITS.medium);
    expect(limitsFor("verifyFromInit", { timeoutMs: 5_000 }, 4_500).timeoutMs).toBe(5_000);
  });

  it("ignores an override that is not a positive number", () => {
    expect(limitsFor("verifyFromInit", { timeoutMs: Number.NaN, maxRssBytes: 0 })).toEqual(
      LIMITS.medium,
    );
  });
});
