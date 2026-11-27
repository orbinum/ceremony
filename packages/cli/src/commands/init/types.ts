/**
 * What `init` works with: one circuit of the ceremony and its on-chain `CircuitId`; its options
 * (the ceremony id, the audited release to build, its circuits, and where; `beyondMeasuredBounds`
 * accepts circuits past what the session and verifier bounds were measured for); and where and how
 * to build (`out` is the staging ceremony directory, where `r1cs/` and `genesis/` are written).
 */
import type { CircuitName } from "@orbinum-ceremony/core";
import type { CircuitRelease, ExportedSource } from "../../source";

export interface InitCircuitOption {
  name: CircuitName;
  circuitId: number;
}

export interface InitOptions {
  ceremonyId: string;
  circuitsRepo: string;
  circuitsRef: string;
  circuits: InitCircuitOption[];
  out: string;
  ptau?: string;
  checkDeterminism: boolean;
  force: boolean;
  beyondMeasuredBounds: boolean;
}

export interface BuildContext {
  release: CircuitRelease;
  source: ExportedSource;
  ptau: string;
  out: string;
  work: string;
  checkDeterminism: boolean;
}
