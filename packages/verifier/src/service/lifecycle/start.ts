/**
 * Startup checks that fail fast (COORDINATOR §5): a fault found here stops the service, instead of
 * turning every later job into `infra`.
 */
import { lstat, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TOOLING } from "@orbinum-ceremony/core";
import { IsolationError } from "../../isolate";
import { exportVerificationKey } from "../../snarkjs";
import { errorMessage } from "../../text";
import type { ServiceConfig } from "../config";
import { type Inputs, loadInputs, mirrorInputs } from "../inputs";
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

/** The private directories this service makes in tmpdir (work, upload stage, inputs stage). */
const OWN_TMP = /^orbinum-(verifier|upload|verifier-inputs)-/;
/** Older than any job or service run could still be using. */
const STALE_TMP_MS = 6 * 60 * 60_000;

/**
 * Removes what a previous run left in tmpdir when it was killed (up to 128 MiB per job, plus the
 * staged ptau): only this service's directories, only long-abandoned ones, never through a link.
 */
export async function sweepStaleTmp(dir = tmpdir(), now = Date.now()): Promise<number> {
  let removed = 0;
  for (const name of await readdir(dir)) {
    if (!OWN_TMP.test(name)) continue;
    const path = join(dir, name);
    // oxlint-disable-next-line no-await-in-loop -- a handful of entries, one at a time
    const info = await lstat(path).catch(() => null);
    if (!info?.isDirectory() || now - info.mtimeMs < STALE_TMP_MS) continue;
    // oxlint-disable-next-line no-await-in-loop -- a handful of entries, one at a time
    await rm(path, { recursive: true, force: true });
    removed += 1;
  }
  return removed;
}

/** The pinned snarkjs, LOG_DIR writable, the pinned inputs staged and pinned, and a child that runs it. */
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
