/**
 * Startup checks that fail fast (COORDINATOR §5): a fault found here stops the service, instead of
 * turning every later job into `infra`.
 */
import { readFile } from "node:fs/promises";
import { TOOLING } from "@orbinum-ceremony/core";
import { IsolationError } from "../../isolate";
import { exportVerificationKey } from "../../snarkjs";
import { errorMessage } from "../../text";
import type { ServiceConfig } from "../config";
import { type Inputs, loadInputs } from "../inputs";
import { probeLogDir } from "../jobs";

/**
 * One snarkjs task in a child process on a staged genesis: proves that children start on this host
 * and from this working directory, as every job's will.
 */
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

/** The installed snarkjs is the pinned one: the version every report names is the one that runs. */
async function assertSnarkjsVersion(): Promise<void> {
  const main = new URL(import.meta.resolve("snarkjs"));
  const { version } = JSON.parse(await readFile(new URL("package.json", main), "utf8")) as {
    version?: unknown;
  };
  if (version !== TOOLING.snarkjs) {
    throw new Error(`snarkjs ${String(version)} is installed, ${TOOLING.snarkjs} is pinned`);
  }
}

/** The pinned snarkjs, LOG_DIR writable, the pinned inputs staged and pinned, and a child that runs it. */
export async function prepare(config: ServiceConfig): Promise<Inputs> {
  await assertSnarkjsVersion();
  await probeLogDir(config.logDir);
  const inputs = await loadInputs(config);
  try {
    await canary(inputs);
    return inputs;
  } catch (error) {
    await inputs.stage.cleanup();
    throw error;
  }
}
