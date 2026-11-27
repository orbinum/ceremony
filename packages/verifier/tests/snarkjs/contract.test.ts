/**
 * Regression of the contract of snarkjs 0.7.6 that the verifier and the public runbook rely on.
 * Re-run on any snarkjs upgrade. The in-process calls cache a curve whose worker threads are
 * released at the end, or they would keep the run alive.
 */
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSections } from "@orbinum-ceremony/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exportVerificationKey, IsolationError, verifyFromInit, verifyFromR1cs } from "../../src";
import * as inProcess from "../../src/snarkjs/in-process";
import { releaseSnarkjs } from "../../src/snarkjs/in-process";
import { PTAU_PATH } from "../support";

const FX = join(import.meta.dirname, "..", "fixtures");
const R1CS = join(FX, "multiplier.r1cs");
const GENESIS = join(FX, "multiplier_0.zkey");
const FINAL = join(FX, "multiplier_final.zkey");
const BIN = join(import.meta.dirname, "..", "..", "node_modules", ".bin", "snarkjs");

const cli = (...args: string[]) => {
  const res = spawnSync(BIN, args, { encoding: "utf8" });
  return { status: res.status, ok: /ZKey Ok!/.test(res.stdout + res.stderr) };
};

describe.skipIf(!PTAU_PATH)("snarkjs 0.7.6 verification contract", { timeout: 60_000 }, () => {
  const ptau = PTAU_PATH as string;
  let corrupted: string;
  let truncated: string;

  beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), "orbinum-a7-"));
    const bytes = new Uint8Array(await readFile(FINAL));
    const h = readSections(bytes, "zkey").get(9)?.[0];
    if (!h) throw new Error("fixture has no H section");
    bytes.set([(bytes[h.offset + 8] ?? 0) ^ 1], h.offset + 8);
    corrupted = join(dir, "corrupted.zkey");
    truncated = join(dir, "truncated.zkey");
    await writeFile(corrupted, bytes);
    await writeFile(truncated, bytes.subarray(0, 2000));
  });

  it.each([
    ["zkv (from r1cs)", R1CS],
    ["zkvi (from genesis)", GENESIS],
  ])("%s: exit 0 ⇔ 'ZKey Ok!' ⇔ valid", (_, base) => {
    const cmd = base === R1CS ? "zkv" : "zkvi";
    expect(cli(cmd, base, ptau, FINAL)).toEqual({ status: 0, ok: true });
    expect(cli(cmd, base, ptau, corrupted)).toEqual({ status: 1, ok: false });
    expect(cli(cmd, base, ptau, truncated)).toEqual({ status: 1, ok: false });
  });

  it("accepts a genesis with no contribution (δ = 1): δ ≠ γ must be checked separately", () => {
    expect(cli("zkv", R1CS, ptau, GENESIS)).toEqual({ status: 0, ok: true });
  });

  it("the long form `zkey verify init` does not work: it prints help and exits 99", () => {
    expect(cli("zkey", "verify", "init", GENESIS, ptau, FINAL).status).toBe(99);
  });

  it("the API throws (not false) on a malformed file", async () => {
    await expect(verifyFromInit(GENESIS, ptau, truncated)).rejects.toThrow(/truncated\.zkey/);
    await expect(verifyFromInit(GENESIS, ptau, corrupted)).resolves.toMatchObject({ ok: false });
  });
});

afterAll(releaseSnarkjs);

describe("snarkjs in a child process", { timeout: 60_000 }, () => {
  it("answers exactly as in-process", async () => {
    const isolated = await exportVerificationKey(FINAL);
    expect(isolated).toEqual(await inProcess.exportVerificationKey(FINAL));
    expect(isolated.protocol).toBe("groth16");
  });

  it("turns a time bound hit into an IsolationError", async () => {
    const error = await exportVerificationKey(FINAL, { timeoutMs: 1 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(IsolationError);
    expect(error).toMatchObject({ failure: "timeout", message: "timed out after 0.001 s" });
  });

  it.skipIf(!PTAU_PATH)("verifies the fixture chain the same way", async () => {
    const ptau = PTAU_PATH as string;
    expect((await verifyFromR1cs(R1CS, ptau, FINAL)).ok).toBe(true);
    expect((await verifyFromInit(GENESIS, ptau, FINAL)).ok).toBe(true);
  });
});
