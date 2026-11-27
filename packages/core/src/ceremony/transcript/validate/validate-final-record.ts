/** One final record read from outside: exact fields, canonical hex, `vk_hash` as the chain stores it. */
import { FormatError } from "../../../primitives/errors";
import {
  asCircuitName,
  asCount,
  asHex,
  asNullable,
  asRecord,
  asString,
} from "../../../primitives/schema";
import type { FinalRecord } from "../types";

export function validateFinalRecord(v: unknown, p = "final"): FinalRecord {
  const o = asRecord(v, p, [
    "circuit",
    "contributions",
    "final_zkey_sha256",
    "vk_json_sha256",
    "vk_hash",
    "cs_hash",
    "delta_neq_gamma",
    "final_chain",
  ]);
  if (o.delta_neq_gamma !== true) throw new FormatError(`${p}.delta_neq_gamma: must be true`);
  return {
    circuit: asCircuitName(o.circuit, `${p}.circuit`),
    contributions: asCount(o.contributions, `${p}.contributions`),
    final_zkey_sha256: asHex(o.final_zkey_sha256, `${p}.final_zkey_sha256`, 32),
    vk_json_sha256: asHex(o.vk_json_sha256, `${p}.vk_json_sha256`, 32),
    vk_hash: asNullable(o.vk_hash, (x) => asString(x, `${p}.vk_hash`, 66, /^0x[0-9a-f]{64}$/)),
    cs_hash: asHex(o.cs_hash, `${p}.cs_hash`, 64),
    delta_neq_gamma: true,
    final_chain: asHex(o.final_chain, `${p}.final_chain`, 32),
  };
}
