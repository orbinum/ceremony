/**
 * Reads the zkey MPC section (id 10) and recomputes every entry's h_k from its bytes, as snarkjs
 * does. Pure: takes the file bytes. The declared entry count is capped (by `maxEntries` and by
 * what the section can hold) before any entry is parsed. Every point of every entry is checked on
 * its curve; entries from `subgroupFrom` on (an upload's new entry) also have g2_spx checked
 * against the G2 subgroup, at ~2 ms each. Beacon parameters must appear on the beacon entry, both,
 * and only there, as snarkjs writes them.
 */
import { MAX_CONTRIBUTIONS } from "../../config";
import { fromUtf8, toHex } from "../../primitives/encoding";
import { FormatError } from "../../primitives/errors";
import { createBlake2b512 } from "../../primitives/hashing";
import { type ByteReader, readSections, sectionReader, uniqueSection } from "../binfile";
import { checkG2Subgroup, g1LemToUncompressed, g2LemToUncompressed } from "../bn254";
import { ZKEY_SECTION } from "./constants";
import type { MpcEntry, MpcEntryKind, MpcParams } from "./types";

interface ReadMpcOptions {
  maxEntries?: number;
  subgroupFrom?: number;
}

const G1 = 64;
const G2 = 128;
const TRANSCRIPT = 64;
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
  const beaconParams = [entry.numIterationsExp, entry.beaconHash].filter((p) => p !== undefined);
  if (beaconParams.length !== (kind === "beacon" ? 2 : 0)) {
    throw new FormatError(`MPC ${kind} entry with the wrong beacon parameters`);
  }
  return entry;
}

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
