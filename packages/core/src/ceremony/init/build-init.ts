/**
 * Builds a validated `init.json` from what `init` measured, pinned to `PTAU` and the pinned snarkjs,
 * its circuits in session order.
 */
import { PTAU, TOOLING } from "../../config";
import { INIT_SCHEMA } from "./constants";
import { sessionOrder } from "./session-order";
import type { InitCircuit, InitRecord } from "./types";
import { validateInit } from "./validate-init";

export const buildInit = (input: {
  ceremonyId: string;
  createdAt: string;
  circom: string;
  circomlib: string;
  circomFlags: readonly string[];
  source: { ref: string; commit: string };
  circuits: InitCircuit[];
}): InitRecord =>
  validateInit({
    schema: INIT_SCHEMA,
    ceremony_id: input.ceremonyId,
    created_at: input.createdAt,
    ptau: { file: PTAU.file, blake2b512: PTAU.blake2b512, size: PTAU.sizeBytes },
    tooling: {
      snarkjs: TOOLING.snarkjs,
      circom: input.circom,
      circomlib: input.circomlib,
      circom_flags: input.circomFlags,
    },
    source: input.source,
    circuits: sessionOrder(input.circuits),
  } satisfies InitRecord);
