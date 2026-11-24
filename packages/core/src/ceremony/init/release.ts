/**
 * The audited circuits release, read from its tree at the pinned commit: `manifest.json` (active
 * version and published r1cs per circuit) and the circomlib version `pnpm-lock.yaml` locks.
 * SPEC §2.1.
 */
import type { CircuitName } from "../../config";
import { parseJsonText } from "../../primitives/encoding";
import { FormatError } from "../../primitives/errors";
import {
  asCircuitName,
  asHex,
  asObject,
  asSafeInt,
  asString,
  VERSION,
} from "../../primitives/schema";

/** What the release published for one circuit. */
export interface PublishedCircuit {
  version: number;
  r1csSha256: string;
}

/** The version a ceremony key becomes: the one after the release's active version. */
export const ceremonyVersionOf = (circuit: PublishedCircuit): number => circuit.version + 1;

/** A circuit's entry in `manifest.json`; extra fields of the release format are ignored. */
function published(manifest: Record<string, unknown>, name: CircuitName): PublishedCircuit {
  const p = `manifest.circuits.${name}`;
  const entry = asObject(asObject(manifest.circuits, "manifest.circuits")[name], p);
  const version = asSafeInt(entry.active_version, `${p}.active_version`, 1, 1000);
  const versions = asObject(entry.versions, `${p}.versions`);
  const v = asObject(versions[String(version)], `${p}.v${version}`);
  // The ceremony's key becomes the next version: one the release already has would be two keys.
  if (Object.hasOwn(versions, String(version + 1))) {
    throw new FormatError(`${p}: v${version + 1} is already published, yet v${version} is active`);
  }
  const r1cs = asObject(asObject(v.artifacts, `${p}.artifacts`).r1cs, `${p}.artifacts.r1cs`);
  return { version, r1csSha256: asHex(r1cs.sha256, `${p}.r1cs.sha256`, 32) };
}

/**
 * The release manifest: a reader per circuit, so only the circuits the ceremony uses must be in
 * it. Throws `FormatError` on text that is not JSON and on a circuit the release does not have.
 */
export function readReleaseManifest(text: string): (name: CircuitName) => PublishedCircuit {
  const manifest = asObject(parseJsonText(text, "manifest.json"), "manifest");
  return (name) => published(manifest, asCircuitName(name, "circuit"));
}

// Horizontal whitespace only between the anchors: no two quantifiers overlap, so no backtracking.
const LOCKED_CIRCOMLIB =
  /\n[ \t]+circomlib:[ \t]*\n[ \t]+specifier:[^\n]*\n[ \t]+version:[ \t]*([^\s(]+)/;

/** The circomlib version `pnpm-lock.yaml` locks; throws if the lock does not name one. */
export function lockedCircomlibOf(lock: string): string {
  const version = LOCKED_CIRCOMLIB.exec(lock)?.[1];
  return asString(version, "pnpm-lock.yaml circomlib version", 32, VERSION);
}
