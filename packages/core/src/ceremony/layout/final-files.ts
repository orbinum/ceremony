/** The files `finalize` publishes under `final/`, each with the SHA-256 its final record pins. */
import type { FinalRecord } from "../transcript";
import { CEREMONY_LAYOUT } from "./constants";

export const finalFiles = (finals: readonly FinalRecord[]): { key: string; sha256: string }[] =>
  finals.flatMap((f) => [
    { key: CEREMONY_LAYOUT.finalZkey(f.circuit), sha256: f.final_zkey_sha256 },
    { key: CEREMONY_LAYOUT.finalVk(f.circuit), sha256: f.vk_json_sha256 },
  ]);
