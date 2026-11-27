/**
 * Startup checks that fail fast, so a fault found here stops the service instead of turning every
 * later job into `infra`: the installed snarkjs is the pinned one (the version every report names
 * is the one that runs), LOG_DIR is writable, the inputs are mirrored when configured, staged and
 * pinned, and one snarkjs task runs in a child process on a staged genesis, proving that children
 * start on this host and from this working directory, as every job's will.
 */
import { readFile } from "node:fs/promises";
import { TOOLING } from "@orbinum-ceremony/core";
import { IsolationError } from "../../isolate";
import { exportVerificationKey } from "../../snarkjs";
import { errorMessage } from "../../text";
import type { ServiceConfig } from "../config";
import { type Inputs, loadInputs, mirrorInputs } from "../inputs";
import { probeLogDir } from "../jobs";
import { sweepStaleTmp } from "./sweep-stale-tmp";

async function canary(inputs: Inputs): Promise<void> {
  const genesis = Object.values(inputs.genesis)[0];
  if (!genesis) throw new Error("init.json names no circuit");
  try {
    await exportVerificationKey(genesis.path);
  } catch (error) {
    const stderr = error instanceof IsolationError && error.stderr ? `: ${error.stderr}` : "";
    throw new Error(`snarkjs does not run in a child process: ${errorMessage(error)}${stderr}`, {
      cause: error,
    });
  }
}

async function assertSnarkjsVersion(): Promise<void> {
  const main = new URL(import.meta.resolve("snarkjs"));
  const { version } = JSON.parse(await readFile(new URL("package.json", main), "utf8")) as {
    version?: unknown;
  };
  if (version !== TOOLING.snarkjs) {
    throw new Error(`snarkjs ${String(version)} is installed, ${TOOLING.snarkjs} is pinned`);
  }
}

export async function prepare(config: ServiceConfig): Promise<Inputs> {
  await assertSnarkjsVersion();
  if (config.initSha256) {
    await mirrorInputs(config.coordinatorUrl, config.initSha256, config.ceremonyDir, config.ptau);
    console.log("verifier: inputs mirrored from the coordinator");
  }
  await probeLogDir(config.logDir);
  const swept = await sweepStaleTmp();
  if (swept > 0) console.log(`verifier: removed ${swept} directories a previous run left behind`);
  const inputs = await loadInputs(config);
  try {
    await canary(inputs);
    return inputs;
  } catch (error) {
    await inputs.stage.cleanup();
    throw error;
  }
}
