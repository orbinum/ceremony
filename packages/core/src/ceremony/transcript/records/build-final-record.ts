/**
 * Builds a circuit's final record. It is not validated here: the transcript validates it with the
 * document.
 */
import type { CircuitName } from "../../../config";
import type { FinalRecord } from "../types";

export const buildFinalRecord = (input: {
  circuit: CircuitName;
  contributions: number;
  finalZkeySha256: string;
  vkJsonSha256: string;
  vkHash: string | null;
  csHash: string;
  finalChain: string;
}): FinalRecord => ({
  circuit: input.circuit,
  contributions: input.contributions,
  final_zkey_sha256: input.finalZkeySha256,
  vk_json_sha256: input.vkJsonSha256,
  vk_hash: input.vkHash,
  cs_hash: input.csHash,
  delta_neq_gamma: true,
  final_chain: input.finalChain,
});
