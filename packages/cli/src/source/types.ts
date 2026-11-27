/**
 * An audited circuits release in the verifier's own clone (a tag, the commit it resolves to, and
 * per circuit the active version and published r1cs SHA-256 from its `manifest.json`), and its tree
 * exported for compiling (circuit sources in `<dir>/circuits/<name>.circom`).
 */
import type { CircuitName, PublishedCircuit } from "@orbinum-ceremony/core";

export interface CircuitRelease {
  repo: string;
  tag: string;
  commit: string;
  published(name: CircuitName): PublishedCircuit;
}

export interface ExportedSource {
  dir: string;
  circomlib: string;
}
