/**
 * A hermetic job runner: the multiplier ceremony staged as the service stages it, a stand-in
 * coordinator, and `run` to serve one upload as the next attempt and run its job. Its pins hold
 * only where the test swaps core's ptau pin for `FAKE_PTAU_TEXT` (`withFakePtau`).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { attemptLogKey, sha256Hex, type VerifierReport } from "@orbinum-ceremony/core";
import { type Inputs, loadConfig, loadInputs, runJob, type ServiceConfig } from "../../src/service";
import { multiplierCeremony } from "./ceremony";
import { FakeCoordinator, HMAC_KEY, jobSpec } from "./coordinator";
import { FAKE_PTAU_TEXT } from "./fake-ptau";

/** The harness of one suite. */
export interface JobHarness {
  coordinator: FakeCoordinator;
  dir: string;
  config: ServiceConfig;
  inputs: Inputs;
  /** The staged genesis' pin and cs hash, as a job carries them. */
  genesis: { sha256: string; csHash: string };
  /** Serves `zkey` (none: a stale job) as the next attempt and runs its job on `inputs`. */
  run(
    zkey: string | undefined,
    over?: Parameters<typeof jobSpec>[2],
    config?: ServiceConfig,
  ): Promise<{
    spec: ReturnType<typeof jobSpec>;
    report?: VerifierReport;
    record(): Promise<string>;
  }>;
  stop(): Promise<void>;
}

export async function jobHarness(): Promise<JobHarness> {
  const coordinator = new FakeCoordinator();
  await coordinator.start();
  const { dir, ptau, init } = await multiplierCeremony(FAKE_PTAU_TEXT);
  const config = loadConfig({
    COORDINATOR_URL: coordinator.url,
    VERIFIER_HMAC_KEY: HMAC_KEY,
    CEREMONY_DIR: dir,
    PTAU: ptau,
    LOG_DIR: join(dir, "logs"),
  });
  const inputs = await loadInputs(config);
  const circuit = init.circuits[0] as (typeof init.circuits)[number];
  const genesis = { sha256: circuit.genesis_sha256, csHash: circuit.cs_hash };
  let attempt = 100;
  const harness: JobHarness = {
    coordinator,
    dir,
    config,
    inputs,
    genesis,
    async run(zkey, over = {}, cfg = config) {
      attempt += 1;
      const bytes = zkey ? await readFile(zkey) : Buffer.from("x");
      const spec = jobSpec(attempt, genesis, {
        size: bytes.length,
        outputSha256: sha256Hex(bytes),
        ...over,
      });
      if (zkey) coordinator.objects.set(`1/shield/${attempt}`, zkey);
      const before = coordinator.reports.length;
      await runJob({ config: cfg, inputs: harness.inputs }, spec);
      return {
        spec,
        report: coordinator.reports[before],
        record: () => readFile(join(cfg.logDir, attemptLogKey(spec.job)), "utf8"),
      };
    },
    async stop() {
      await coordinator.stop();
      await harness.inputs.stage.cleanup();
    },
  };
  return harness;
}
