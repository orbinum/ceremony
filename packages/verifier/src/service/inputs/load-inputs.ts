/**
 * Reads init.json, stages the ptau and every genesis it names into private read-only copies, and
 * pins the copies: snarkjs only ever opens the copies. init.json is read as published: bounded,
 * strict UTF-8, and its exact canonical bytes, so a leading byte-order mark (which the decoder
 * would silently drop) is refused.
 */
import { join } from "node:path";
import {
  CEREMONY_LAYOUT,
  checkInitAgainstConfig,
  fromUtf8,
  type InitRecord,
  MAX_DOCUMENT_BYTES,
  parseInit,
  utf8,
} from "@orbinum-ceremony/core";
import { readBytes } from "../../files";
import type { ServiceConfig } from "../config";
import { checkPins } from "./check-pins";
import { stageCopies } from "./stage-copies";
import type { Inputs } from "./types";

async function readInit(ceremonyDir: string): Promise<InitRecord> {
  const bytes = await readBytes(join(ceremonyDir, CEREMONY_LAYOUT.init), MAX_DOCUMENT_BYTES);
  let text: string;
  try {
    text = fromUtf8(bytes);
  } catch {
    throw new Error("init.json: not valid UTF-8");
  }
  if (utf8(text).length !== bytes.length)
    throw new Error("init.json: starts with a byte-order mark");
  return parseInit(text);
}

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
