/**
 * What `finalize` works with: its options (the ceremony, its ptau and the vk packer), one circuit's
 * plan (its accepted chain and the head zkey the beacon is applied to), and what every circuit's
 * finalization shares (`out` is where the final keys are built, swapped into `final/` once every
 * circuit succeeded).
 */
import type {
  BeaconRecord,
  CeremonyAnnouncement,
  Chained,
  CircuitName,
  ContributionRecord,
  InitRecord,
} from "@orbinum-ceremony/core";
import type { TranscriptStore } from "../../store";

export interface FinalizeOptions {
  dir: string;
  ptau: string;
  vkPacker?: string;
}

export interface CircuitPlan {
  circuit: CircuitName;
  accepted: Chained<ContributionRecord>[];
  headZkey: string;
}

export interface FinalizeContext {
  dir: string;
  out: string;
  ptau: string;
  init: InitRecord;
  store: TranscriptStore;
  beacon: BeaconRecord;
  announcement: CeremonyAnnouncement;
  vkPacker?: string;
}
