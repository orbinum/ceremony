/**
 * The zkey MPC section (id 10): csHash and one entry per contribution or beacon, each with h_k
 * recomputed from its bytes as snarkjs does. SPEC §2.5 #3.
 */
import { MAX_CONTRIBUTIONS } from "../../config";
import { FormatError } from "../../primitives/errors";
import { fromUtf8, toHex } from "../../primitives/encoding";
import { createBlake2b512 } from "../../primitives/hashing";
import { type ByteReader, readSections, sectionReader, uniqueSection } from "../binfile";
import { checkG2Subgroup, g1LemToUncompressed, g2LemToUncompressed } from "../bn254";
import { ZKEY_SECTION } from "./zkey";

/** What produced an entry: a contributor's secret, or the public beacon. */
type MpcEntryKind = "contribution" | "beacon";

/** One MPC entry. */
interface MpcEntry {
  kind: MpcEntryKind;
  /**
   * h_k: BLAKE2b-512 over (deltaAfter, g1_s, g1_sx, g2_spx, transcript), as snarkjs computes it.
   */
  hash: string;
  /** δ·G1 after this entry, uncompressed big-endian hex (not covered by h_k on its own). */
  deltaAfter: string;
  /** Free-text name; outside h_k, so only the transcript pins it. */
  name?: string;
  /** Beacon parameters (tags 2 and 3). */
  numIterationsExp?: number;
  beaconHash?: string;
}

/** The parsed MPC section. */
export interface MpcParams {
  /** csHash: BLAKE2b-512 identity of (r1cs, ptau), written at `groth16 setup`. */
  csHash: string;
  entries: MpcEntry[];
}

/** Parsing bounds. */
interface ReadMpcOptions {
  /** Refuses files declaring more entries than this, before parsing them. */
  maxEntries?: number;
  /**
   * Entries from this index on also have g2_spx checked against the G2 subgroup (~2 ms each): an
   * upload's new entry. Every point of every entry is always on its curve.
   */
  subgroupFrom?: number;
}

const G1 = 64;
const G2 = 128;
const TRANSCRIPT = 64;
/** Smallest encoded entry: 3 × G1 + G2 + transcript + type + params length. */
const MIN_ENTRY = 3 * G1 + G2 + TRANSCRIPT + 8;

const KIND: Record<number, MpcEntryKind> = { 0: "contribution", 1: "beacon" };

function readName(r: ByteReader): string {
  const bytes = r.bytesOf(r.u8());
  if (bytes.length === 0) throw new FormatError("empty MPC entry name");
  try {
    return fromUtf8(bytes);
  } catch {
    throw new FormatError("MPC entry name is not UTF-8");
  }
}

function readEntry(r: ByteReader, subgroup: boolean): MpcEntry {
  const deltaAfter = r.bytesOf(G1);
  const g1S = r.bytesOf(G1);
  const g1Sx = r.bytesOf(G1);
  const g2Spx = r.bytesOf(G2);
  const transcript = r.bytesOf(TRANSCRIPT);
  const type = r.u32();
  const kind = Object.hasOwn(KIND, type) ? KIND[type] : undefined;
  if (!kind) throw new FormatError("unknown MPC entry type");
  if (subgroup) checkG2Subgroup(g2Spx);

  const delta = g1LemToUncompressed(deltaAfter);
  const hash = createBlake2b512()
    .update(delta)
    .update(g1LemToUncompressed(g1S))
    .update(g1LemToUncompressed(g1Sx))
    .update(g2LemToUncompressed(g2Spx))
    .update(transcript)
    .digestHex();

  const entry: MpcEntry = { kind, hash, deltaAfter: toHex(delta) };
  const end = r.u32() + r.pos;
  if (end > r.end) throw new FormatError("MPC entry parameters run past the section");
  let lastTag = 0;
  while (r.pos < end) {
    const tag = r.u8();
    if (tag <= lastTag) throw new FormatError("MPC entry parameters not sorted");
    lastTag = tag;
    if (tag === 1) entry.name = readName(r);
    else if (tag === 2) entry.numIterationsExp = r.u8();
    else if (tag === 3) entry.beaconHash = toHex(r.bytesOf(r.u8()));
    else throw new FormatError(`unknown MPC parameter ${tag}`);
  }
  if (r.pos !== end) throw new FormatError("MPC entry parameter length mismatch");
  // As snarkjs writes them: beacon parameters on the beacon, both, and only there.
  const beaconParams = [entry.numIterationsExp, entry.beaconHash].filter((p) => p !== undefined);
  if (beaconParams.length !== (kind === "beacon" ? 2 : 0)) {
    throw new FormatError(`MPC ${kind} entry with the wrong beacon parameters`);
  }
  return entry;
}

/** Reads the MPC section of a zkey and recomputes every entry's h_k. Pure: takes the file bytes. */
export function readMpcParams(zkey: Uint8Array, options: ReadMpcOptions = {}): MpcParams {
  const section = uniqueSection(readSections(zkey, "zkey"), ZKEY_SECTION.mpcParams);
  const r = sectionReader(zkey, section);

  const csHash = toHex(r.bytesOf(64));
  const count = r.u32();
  const max = Math.min(
    options.maxEntries ?? MAX_CONTRIBUTIONS + 1,
    Math.floor((r.end - r.pos) / MIN_ENTRY),
  );
  if (count > max) throw new FormatError(`declares ${count} entries, at most ${max} allowed`);

  const from = options.subgroupFrom ?? count;
  const entries = Array.from({ length: count }, (_, i) => readEntry(r, i >= from));
  if (r.pos !== r.end) throw new FormatError("trailing bytes in MPC section");
  return { csHash, entries };
}
