/**
 * One job end to end with the real ptau and snarkjs: an honest contribution accepted, a bound hit
 * as `infra`, and inputs staged again after a temp-dir cleaner.
 */
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { type InitRecord, sha256Hex } from "@orbinum-ceremony/core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { contribute } from "../../../src";
import {
  type Inputs,
  loadConfig,
  loadInputs,
  runJob,
  type ServiceConfig,
} from "../../../src/service";
import { FakeCoordinator, HMAC_KEY, jobSpec, PTAU_PATH, shieldCeremony } from "../../support";

describe.skipIf(!PTAU_PATH)("run job with the real ptau", { timeout: 300_000 }, () => {
  const coordinator = new FakeCoordinator();
  let dir = "";
  let init: InitRecord;
  let inputs: Inputs;
  let config: ServiceConfig;
  let attempt = 100;
  let honest = "";
  let honestHash = "";

  async function verify(zkey: string, cfg = config) {
    attempt += 1;
    const g = init.circuits[0] as InitRecord["circuits"][number];
    const bytes = await readFile(zkey);
    const s = jobSpec(
      attempt,
      { sha256: g.genesis_sha256, csHash: g.cs_hash },
      { size: bytes.length, outputSha256: sha256Hex(bytes), contributionHash: honestHash },
    );
    coordinator.objects.set(`1/shield/${attempt}`, zkey);
    const before = coordinator.reports.length;
    await runJob({ config: cfg, inputs }, s);
    return coordinator.reports[before];
  }

  beforeAll(async () => {
    await coordinator.start();
    ({ dir, init } = await shieldCeremony(PTAU_PATH as string));
    config = loadConfig({
      COORDINATOR_URL: coordinator.url,
      VERIFIER_HMAC_KEY: HMAC_KEY,
      CEREMONY_DIR: dir,
      PTAU: PTAU_PATH as string,
    });
    inputs = await loadInputs(config);
    honest = join(dir, "honest.zkey");
    honestHash = await contribute(inputs.genesis.shield?.path as string, honest, "alice", "e1");
  }, 180_000);
  afterAll(async () => {
    await coordinator.stop();
    await inputs.stage.cleanup();
  });

  it("accepts an honest contribution", async () => {
    expect(await verify(honest)).toMatchObject({
      result: "valid",
      contributionHash: honestHash,
      zkeyName: "alice",
      snarkjsVersion: "0.7.6",
    });
  });

  it("reports infra when a check outlives its bound", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await verify(honest, { ...config, timeoutMs: 1 })).toMatchObject({
        result: "infra",
        detail: "timed out after 0.001 s",
      });
    } finally {
      error.mockRestore();
    }
  });

  it("stages the ptau again after a temp-dir cleaner removed it, and still verifies", async () => {
    await rm(inputs.ptau);
    expect(await verify(honest)).toMatchObject({ result: "valid" });
    expect(inputs.pinned).toBe(true);
  });
});
