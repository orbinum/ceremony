/**
 * The published ceremony directory (SPEC §6.1): one set of relative POSIX keys, used for files on
 * disk (cli), objects in the public bucket (coordinator) and inputs on the VPS (verifier).
 */
import { type CircuitName, PTAU } from "../../config";
import { isCircuitName } from "../../primitives/schema";
import { circuitsOf, type InitRecord } from "../init";
import type { FinalRecord, Transcript } from "../transcript";

/** Where each artifact lives, relative to the ceremony root. */
export const CEREMONY_LAYOUT = {
  announcement: "ceremony.json",
  init: "genesis/init.json",
  transcript: "transcript.json",
  status: "status.json",
  ptau: `ptau/${PTAU.file}`,
  r1cs: (c: CircuitName) => `r1cs/${c}.r1cs`,
  /** Index 0 is the genesis. */
  zkey: (c: CircuitName, index: number) =>
    index === 0 ? `genesis/${c}.genesis.zkey` : `contributions/${c}/${index}.zkey`,
  /** Every circuit's accepted contributions, one directory each. */
  allContributions: "contributions",
  /** A circuit's accepted contributions, `1.zkey` … `k.zkey`. */
  contributions: (c: CircuitName) => `contributions/${c}`,
  log: (c: CircuitName, index: number) => `logs/${c}/${index}.log`,
  /** The final keys and verification keys, written together by `finalize`. */
  final: "final",
  finalZkey: (c: CircuitName) => `final/${c}.final.zkey`,
  finalVk: (c: CircuitName) => `final/${c}.vk.json`,
} as const;

/**
 * The setup files published once before opening (`publish-init`), in upload order. The
 * announcement goes last: published files are immutable, so it must never be public while a file
 * it pins could still fail to upload.
 */
export const setupFiles = (init: InitRecord): string[] => [
  CEREMONY_LAYOUT.init,
  ...circuitsOf(init).flatMap((c) => [CEREMONY_LAYOUT.r1cs(c), CEREMONY_LAYOUT.zkey(c, 0)]),
  CEREMONY_LAYOUT.ptau,
  CEREMONY_LAYOUT.announcement,
];

/**
 * Every file of a published ceremony whose SHA-256 is pinned somewhere upstream: r1cs and genesis
 * by `init.json`, contributions and logs by their records, finals by the final records. Only the
 * circuits `init.json` names: a record for another circuit names no file of this ceremony.
 */
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

/** The files `finalize` publishes under `final/`, each with the SHA-256 its final record pins. */
export const finalFiles = (finals: readonly FinalRecord[]): { key: string; sha256: string }[] =>
  finals.flatMap((f) => [
    { key: CEREMONY_LAYOUT.finalZkey(f.circuit), sha256: f.final_zkey_sha256 },
    { key: CEREMONY_LAYOUT.finalVk(f.circuit), sha256: f.vk_json_sha256 },
  ]);

/** A byte no key holds: what a layout path is split on to find where its circuit goes. */
const HOLE = "\u0000";

/** The circuit `key` is `path`'s for (one of `CEREMONY_LAYOUT`'s per-circuit paths), or null. */
function circuitIn(key: string, path: (c: CircuitName) => string): CircuitName | null {
  const [prefix = "", suffix = ""] = path(HOLE).split(HOLE);
  if (!key.startsWith(prefix) || !key.endsWith(suffix)) return null;
  const name = key.slice(prefix.length, key.length - suffix.length);
  return isCircuitName(name) ? name : null;
}

const FIXED_SETUP_KEYS = new Set<string>([
  CEREMONY_LAYOUT.announcement,
  CEREMONY_LAYOUT.init,
  CEREMONY_LAYOUT.ptau,
]);

/** The circuit of a per-circuit setup file (`r1cs/<c>.r1cs`, `genesis/<c>.genesis.zkey`), or null. */
export const setupCircuitOf = (key: string): CircuitName | null =>
  circuitIn(key, CEREMONY_LAYOUT.r1cs) ?? circuitIn(key, (c) => CEREMONY_LAYOUT.zkey(c, 0));

/**
 * Whether `key` is a setup file, whatever circuits the ceremony uses: what `publish-init` may
 * upload. Which circuits it really has is `init.json`'s to say (the coordinator holds each
 * per-circuit file against the published one).
 */
export const isSetupFileKey = (key: string): boolean =>
  FIXED_SETUP_KEYS.has(key) || setupCircuitOf(key) !== null;

/** The circuit of a final file (`final/<c>.final.zkey` or `final/<c>.vk.json`), or null. */
export const finalCircuitOf = (key: string): CircuitName | null =>
  circuitIn(key, CEREMONY_LAYOUT.finalZkey) ?? circuitIn(key, CEREMONY_LAYOUT.finalVk);

/** Whether `key` is a final file (what the operator may publish once the ceremony is sealed). */
export const isFinalFileKey = (key: string): boolean => finalCircuitOf(key) !== null;

/** The media type a published file is served with. */
export function contentTypeOf(key: string): string {
  if (key.endsWith(".json")) return "application/json";
  if (key.endsWith(".log")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}
