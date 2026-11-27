/**
 * Real uploads built from the multiplier fixture (contribute and beacon need no ptau), the heads
 * they apply to, the claims an honest client makes, and byte-level mutations of them, for the
 * hermetic pipeline suites. A δ2 limb rewritten as `limb + q` is a non-canonical spelling of the
 * same point that snarkjs' pairing tolerates.
 */
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type CurrentHead,
  genesisLayoutOf,
  readMpcParams,
  readSections,
  sha256Hex,
  type UploadClaim,
  uniqueSection,
} from "@orbinum-ceremony/core";
import { applyBeacon, contribute } from "../../src/snarkjs";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");
export const MULTIPLIER_GENESIS = join(FIXTURES, "multiplier_0.zkey");
export const MULTIPLIER_R1CS = join(FIXTURES, "multiplier.r1cs");

export interface Upload {
  path: string;
  bytes: Uint8Array;
  hash: string;
}

export interface Uploads {
  dir: string;
  genesis: Upload;
  atGenesis: CurrentHead;
  afterC1: CurrentHead;
  c1: Upload;
  c2: Upload;
  beacon: Upload;
  badName: Upload;
}

export const claimFor = (u: Upload, head: CurrentHead): UploadClaim => ({
  inputSha256: head.outputSha256,
  outputSha256: sha256Hex(u.bytes),
  contributionHash: u.hash,
});

export async function written(
  dir: string,
  name: string,
  bytes: Uint8Array,
  hash: string,
): Promise<Upload> {
  const path = join(dir, name);
  await writeFile(path, bytes);
  return { path, bytes, hash };
}

async function built(dir: string, name: string, make: (out: string) => Promise<string | void>) {
  const path = join(dir, name);
  const hash = (await make(path)) ?? "";
  return { path, bytes: new Uint8Array(await readFile(path)), hash };
}

export async function buildUploads(): Promise<Uploads> {
  const dir = await mkdtemp(join(tmpdir(), "orbinum-verify-upload-"));
  const bytes = new Uint8Array(await readFile(MULTIPLIER_GENESIS));
  const genesis = { path: MULTIPLIER_GENESIS, bytes, hash: "" };
  const csHash = readMpcParams(bytes).csHash;
  const atGenesis = { outputSha256: sha256Hex(bytes), csHash, previous: [] };
  const c1 = await built(dir, "c1.zkey", (out) =>
    contribute(MULTIPLIER_GENESIS, out, "test-1", "entropy-1"),
  );
  const first = readMpcParams(c1.bytes).entries[0];
  const afterC1 = {
    outputSha256: sha256Hex(c1.bytes),
    csHash,
    previous: [{ hash: c1.hash, name: "test-1", deltaAfter: first?.deltaAfter ?? "" }],
  };
  const c2 = await built(dir, "c2.zkey", (out) => contribute(c1.path, out, "test-2", "entropy-2"));
  const beacon = await built(dir, "beacon.zkey", (out) =>
    applyBeacon(c1.path, out, "b", "ab".repeat(32), 10),
  );
  beacon.hash = readMpcParams(beacon.bytes).entries.at(-1)?.hash ?? "";
  const badName = await built(dir, "bad-name.zkey", (out) =>
    contribute(c1.path, out, "bad\u0001name", "e"),
  );
  return { dir, genesis, atGenesis, afterC1, c1, c2, beacon, badName };
}

export const groth16Offset = (b: Uint8Array) => uniqueSection(readSections(b, "zkey"), 2).offset;

export function delta2LimbPlusQ(bytes: Uint8Array, limb: 0 | 1 | 2 | 3): Uint8Array {
  const out = bytes.slice();
  const at = groth16Offset(out);
  const view = new DataView(out.buffer, out.byteOffset);
  const n8q = view.getUint32(at, true);
  const le = (from: number) => {
    let v = 0n;
    for (let i = n8q - 1; i >= 0; i--) v = (v << 8n) | BigInt(out[from + i] ?? 0);
    return v;
  };
  const q = le(at + 4);
  const { deltaFrom } = genesisLayoutOf(bytes);
  const offset = at + deltaFrom + 2 * n8q + limb * n8q;
  let v = le(offset) + q;
  for (let i = 0; i < n8q; i++) {
    out[offset + i] = Number(v & 0xffn);
    v >>= 8n;
  }
  if (v !== 0n) throw new Error("limb + q overflowed its bytes");
  return out;
}
