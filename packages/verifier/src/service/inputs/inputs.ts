/**
 * The pinned ptau and genesis keys, staged into private read-only copies and pinned on those
 * copies: snarkjs only ever opens the copies. SPEC §2.5, §7.
 */
import { join } from "node:path";
import {
  CEREMONY_LAYOUT,
  checkInitAgainstConfig,
  type CircuitName,
  fromUtf8,
  type InitRecord,
  MAX_DOCUMENT_BYTES,
  parseInit,
  PTAU,
  utf8,
} from "@orbinum-ceremony/core";
import { createStage, readBytes, type Stage } from "../../files";
import { assertPinnedFile, assertPinnedPtau } from "../../pins";
import type { ServiceConfig } from "../config";

/** The pinned inputs every verification runs against: private copies and their pins. */
export interface Inputs {
  init: InitRecord;
  /** The staged ptau copy. */
  ptau: string;
  /** The staged genesis copy of each circuit, with its init.json pin. */
  genesis: Partial<Record<CircuitName, { path: string; sha256: string }>>;
  /** Owns the copies; `cleanup` on shutdown. */
  stage: Stage;
  /** The last pin check's outcome (startup, then before each job). */
  pinned: boolean;
  /** Where the copies come from, to stage them again if the host removes them. */
  sources: Pick<ServiceConfig, "ceremonyDir" | "ptau">;
}

type Copies = Pick<Inputs, "ptau" | "genesis" | "stage">;

/** init.json as published: bounded, strict UTF-8, and its exact canonical bytes. */
async function readInit(ceremonyDir: string): Promise<InitRecord> {
  const bytes = await readBytes(join(ceremonyDir, CEREMONY_LAYOUT.init), MAX_DOCUMENT_BYTES);
  let text: string;
  try {
    text = fromUtf8(bytes);
  } catch {
    throw new Error("init.json: not valid UTF-8");
  }
  // The decoder drops a leading byte-order mark; the canonical bytes have none.
  if (utf8(text).length !== bytes.length)
    throw new Error("init.json: starts with a byte-order mark");
  return parseInit(text);
}

/** Stages the ptau and every genesis `init` names into a new private directory. */
async function stageCopies(init: InitRecord, sources: Inputs["sources"]): Promise<Copies> {
  const stage = await createStage("orbinum-verifier-inputs-", sources.ceremonyDir);
  try {
    const genesis: Inputs["genesis"] = {};
    for (const c of init.circuits) {
      genesis[c.name] = {
        // oxlint-disable-next-line no-await-in-loop -- one copy at a time
        path: await stage.copy(
          join(sources.ceremonyDir, CEREMONY_LAYOUT.zkey(c.name, 0)),
          `${c.name}.genesis.zkey`,
        ),
        sha256: c.genesis_sha256,
      };
    }
    const ptau = await stage.copy(sources.ptau, "ptau", PTAU.sizeBytes);
    return { ptau, genesis, stage };
  } catch (error) {
    await stage.cleanup();
    throw error;
  }
}

/** Reads init.json, stages the ptau and every genesis it names, and pins the copies. */
export async function loadInputs(config: ServiceConfig): Promise<Inputs> {
  const init = await readInit(config.ceremonyDir);
  const problems = checkInitAgainstConfig(init);
  if (problems.length > 0) throw new Error(`init.json: ${problems.join("; ")}`);
  const sources = { ceremonyDir: config.ceremonyDir, ptau: config.ptau };
  const inputs: Inputs = { init, ...(await stageCopies(init, sources)), pinned: false, sources };
  try {
    await checkPins(inputs);
    return inputs;
  } catch (error) {
    await inputs.stage.cleanup();
    throw error;
  }
}

/**
 * Re-hashes the staged copies against their pins, genesis keys first, and records the outcome in
 * `pinned`. A failure on our own files must end as `infra`, never as a contributor's `rejected`.
 */
export async function checkPins(inputs: Inputs): Promise<void> {
  try {
    for (const [name, g] of Object.entries(inputs.genesis)) {
      // oxlint-disable-next-line no-await-in-loop -- one hash at a time
      await assertPinnedFile(inputs.init, name as CircuitName, "genesis", g.path);
    }
    await assertPinnedPtau(inputs.ptau);
    inputs.pinned = true;
  } catch (error) {
    inputs.pinned = false;
    throw error;
  }
}

/**
 * `checkPins`, staging the copies again from their sources first when one is gone: a temp-dir
 * cleaner may remove them during a long pause. The new copies are pinned like the first ones.
 */
export async function ensurePinned(inputs: Inputs): Promise<void> {
  try {
    await checkPins(inputs);
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code !== "ENOENT") throw error;
    const old = inputs.stage;
    Object.assign(inputs, await stageCopies(inputs.init, inputs.sources));
    await old.cleanup().catch(() => {});
    await checkPins(inputs);
  }
}
