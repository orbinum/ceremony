/**
 * Byte surgery on real iden3 files, to build malformed inputs from honest ones: split a binfile
 * into its parts, join parts back without checks (so invalid files can be written too), replace one
 * section's data, locate an MPC entry's fields for in-place edits, and convert little-endian
 * 256-bit field elements.
 */

export interface RawSection {
  type: number;
  data: Uint8Array;
}

export function splitBinfile(bytes: Uint8Array): {
  magic: string;
  version: number;
  sections: RawSection[];
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(8, true);
  const sections: RawSection[] = [];
  let pos = 12;
  for (let i = 0; i < count; i++) {
    const type = view.getUint32(pos, true);
    const size = Number(view.getBigUint64(pos + 4, true));
    sections.push({ type, data: bytes.slice(pos + 12, pos + 12 + size) });
    pos += 12 + size;
  }
  return {
    magic: new TextDecoder().decode(bytes.subarray(0, 4)),
    version: view.getUint32(4, true),
    sections,
  };
}

export function joinBinfile(
  magic: string,
  version: number,
  sections: readonly RawSection[],
): Uint8Array {
  const size = 12 + sections.reduce((n, s) => n + 12 + s.data.length, 0);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  out.set(new TextEncoder().encode(magic), 0);
  view.setUint32(4, version, true);
  view.setUint32(8, sections.length, true);
  let pos = 12;
  for (const s of sections) {
    view.setUint32(pos, s.type, true);
    view.setBigUint64(pos + 4, BigInt(s.data.length), true);
    out.set(s.data, pos + 12);
    pos += 12 + s.data.length;
  }
  return out;
}

export function editSection(
  bytes: Uint8Array,
  type: number,
  edit: (data: Uint8Array) => Uint8Array,
): Uint8Array {
  const f = splitBinfile(bytes);
  return joinBinfile(
    f.magic,
    f.version,
    f.sections.map((s) => (s.type === type ? { type, data: edit(s.data.slice()) } : s)),
  );
}

export function mpcEntryOffsets(section: Uint8Array, i: number) {
  const view = new DataView(section.buffer, section.byteOffset, section.byteLength);
  let pos = 64 + 4;
  for (let k = 0; ; k++) {
    const entry = pos;
    const type = entry + 3 * 64 + 128 + 64;
    const paramsLength = type + 4;
    const params = paramsLength + 4;
    const end = params + view.getUint32(paramsLength, true);
    if (k === i) return { entry, deltaAfter: entry, type, paramsLength, params, end };
    pos = end;
  }
}

export const leToBig = (b: Uint8Array) => b.reduceRight((v, x) => (v << 8n) | BigInt(x), 0n);
export function bigToLe(v: bigint, out: Uint8Array): void {
  for (let i = 0; i < out.length; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
}
