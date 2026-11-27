/**
 * The operator's state on disk: local metrics of simulated contributions (size and timings in ms,
 * keyed `<circuit>/<index>`), and the transcript store (a transcript plus its chain root, every
 * append validated and persisted at once).
 */
import type { Chained, Transcript, TranscriptRecord } from "@orbinum-ceremony/core";

export interface ContributionMetrics {
  bytes: number;
  ms: { contribute: number; precheck: number; verify: number; verify_from_r1cs?: number };
}

export type Metrics = Record<string, ContributionMetrics>;

export interface TranscriptStore {
  transcript: Transcript;
  genesis: string;
  append<R extends TranscriptRecord>(record: R): Promise<Chained<R>>;
  save(): Promise<void>;
}
