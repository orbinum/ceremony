/**
 * Every file of a published ceremony whose SHA-256 is pinned somewhere upstream: r1cs and genesis
 * by `init.json`, contributions and logs by their records, finals by the final records. Only the
 * circuits `init.json` names: a record for another circuit names no file of this ceremony.
 */
import { circuitsOf, type InitRecord } from "../init";
import type { Transcript } from "../transcript";
import { CEREMONY_LAYOUT } from "./constants";
import { finalFiles } from "./final-files";

export function pinnedFiles(
  init: InitRecord,
  transcript: Transcript,
): { key: string; sha256: string }[] {
  const files = init.circuits.flatMap((c) => [
    { key: CEREMONY_LAYOUT.r1cs(c.name), sha256: c.r1cs_sha256 },
    { key: CEREMONY_LAYOUT.zkey(c.name, 0), sha256: c.genesis_sha256 },
  ]);
  const known = new Set(circuitsOf(init));
  for (const r of transcript.records) {
    if (r.type !== "contribution" || !known.has(r.circuit)) continue;
    files.push(
      { key: CEREMONY_LAYOUT.zkey(r.circuit, r.index), sha256: r.output_sha256 },
      { key: CEREMONY_LAYOUT.log(r.circuit, r.index), sha256: r.verifier_log_sha256 },
    );
  }
  files.push(...finalFiles(transcript.finals.filter((f) => known.has(f.circuit))));
  return files;
}
