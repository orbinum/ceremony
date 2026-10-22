/**
 * The audited circuits release, read from its tree at the pinned commit: `manifest.json` (active
 * version and published r1cs per circuit) and the circomlib version `pnpm-lock.yaml` locks.
 * SPEC §2.1.
 */
import { CIRCUIT_ORDER, type CircuitName } from "../../config";
import { parseJsonText } from "../../primitives/encoding";
import { FormatError } from "../../primitives/errors";
import { asHex, asObject, asSafeInt, asString, VERSION } from "../../primitives/schema";

/** What the release published for one circuit. */
export interface PublishedCircuit {
  version: number;
  r1csSha256: string;
}

/** A circuit's entry in `manifest.json`; extra fields of the release format are ignored. */
function published(manifest: Record<string, unknown>, name: CircuitName): PublishedCircuit {
  const p = `manifest.circuits.${name}`;
  const entry = asObject(asObject(manifest.circuits, "manifest.circuits")[name], p);
  const version = asSafeInt(entry.active_version, `${p}.active_version`, 1, 1000);
  const v = asObject(
    asObject(entry.versions, `${p}.versions`)[String(version)],
    `${p}.v${version}`,
  );
  const r1cs = asObject(asObject(v.artifacts, `${p}.artifacts`).r1cs, `${p}.artifacts.r1cs`);
  return { version, r1csSha256: asHex(r1cs.sha256, `${p}.r1cs.sha256`, 32) };
}

/**
 * The release manifest: a reader per circuit, so a manifest missing a circuit the ceremony does
 * not use is not an error. Throws `FormatError` on text that is not JSON.
 */
export function readReleaseManifest(text: string): (name: CircuitName) => PublishedCircuit {
  const manifest = asObject(parseJsonText(text, "manifest.json"), "manifest");
  return (name) => {
    if (!CIRCUIT_ORDER.includes(name)) throw new FormatError(`unknown circuit ${String(name)}`);
    return published(manifest, name);
  };
}

const LOCKED_CIRCOMLIB = /\n\s+circomlib:\s*\n\s+specifier:[^\n]*\n\s+version:\s*([^\s(]+)/;

/** The circomlib version `pnpm-lock.yaml` locks; throws if the lock does not name one. */
export function lockedCircomlibOf(lock: string): string {
  const version = LOCKED_CIRCOMLIB.exec(lock)?.[1];
  return asString(version, "pnpm-lock.yaml circomlib version", 32, VERSION);
}
