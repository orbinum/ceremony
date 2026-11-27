/**
 * The audited circuits release's `manifest.json`, read from its tree at the pinned commit: a reader
 * per circuit (active version and published r1cs), so only the circuits the ceremony uses must be
 * in it; extra fields of the release format are ignored. Throws `FormatError` on text that is not
 * JSON, on a circuit the release does not have, and when the version after the active one is
 * already published (the ceremony's key becomes that version: one the release already has would
 * be two keys).
 */
import type { CircuitName } from "../../config";
import { parseJsonText } from "../../primitives/encoding";
import { FormatError } from "../../primitives/errors";
import { asCircuitName, asHex, asObject, asSafeInt } from "../../primitives/schema";
import type { PublishedCircuit } from "./types";

function published(manifest: Record<string, unknown>, name: CircuitName): PublishedCircuit {
  const p = `manifest.circuits.${name}`;
  const entry = asObject(asObject(manifest.circuits, "manifest.circuits")[name], p);
  const version = asSafeInt(entry.active_version, `${p}.active_version`, 1, 1000);
  const versions = asObject(entry.versions, `${p}.versions`);
  const v = asObject(versions[String(version)], `${p}.v${version}`);
  if (Object.hasOwn(versions, String(version + 1))) {
    throw new FormatError(`${p}: v${version + 1} is already published, yet v${version} is active`);
  }
  const r1cs = asObject(asObject(v.artifacts, `${p}.artifacts`).r1cs, `${p}.artifacts.r1cs`);
  return { version, r1csSha256: asHex(r1cs.sha256, `${p}.r1cs.sha256`, 32) };
}

export function readReleaseManifest(text: string): (name: CircuitName) => PublishedCircuit {
  const manifest = asObject(parseJsonText(text, "manifest.json"), "manifest");
  return (name) => published(manifest, asCircuitName(name, "circuit"));
}
