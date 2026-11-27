/**
 * What `contribute-local` works with: its options (a rehearsal ceremony, its ptau, how many
 * simulated contributors, and whether every upload is also verified from r1cs), one contribution's
 * step, and a verified contribution (its record, measurements, and the files it wrote).
 */
import type { ContributionRecord, InitRecord } from "@orbinum-ceremony/core";
import type { ContributionMetrics, TranscriptStore } from "../../store";

export interface ContributeLocalOptions {
  dir: string;
  ptau: string;
  contributors: number;
  crossCheckR1cs: boolean;
}

export interface Step {
  options: ContributeLocalOptions;
  init: InitRecord;
  store: TranscriptStore;
  seq: number;
  contributor: string;
}

export interface Contribution {
  record: ContributionRecord;
  metrics: ContributionMetrics;
  files: string[];
}
