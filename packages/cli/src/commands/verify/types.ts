/**
 * What `verify` works with. Its options: the published directory, the SHA-256 of ceremony.json from
 * an official channel (the root of trust), the network the verifier expects (an announcement for
 * another one fails), and the external inputs of a full verification, among them the independent
 * Rust verifier; `local` lets a local ceremony skip security checks that need external inputs, and
 * `snarkjsLimits` lowers each snarkjs call's bounds (programmatic only: tests). The staged private
 * copies of every per-circuit input (a missing entry failed to stage). And the context every check
 * group shares, with the cheap checks each circuit failed: its snarkjs and Rust checks are then
 * reported failed without running on input already known to be wrong.
 */
import type {
  CeremonyAnnouncement,
  CircuitName,
  InitRecord,
  Network,
  Transcript,
} from "@orbinum-ceremony/core";
import type { Loaded } from "../../artifacts";
import type { Stage } from "../../io";
import type { LimitsOverride } from "../../tools";
import type { Report } from "../../ui";
import type { Failed } from "./gate";

export interface VerifyOptions {
  dir: string;
  announcementSha256: string;
  network: Network;
  ptau: string;
  circuitsRepo?: string;
  rebuildGenesis: boolean;
  vkPacker?: string;
  rustVerifier?: string;
  report?: string;
  local: boolean;
  snarkjsLimits?: LimitsOverride;
}

export interface StagedFiles {
  ptau?: string;
  r1cs: Map<CircuitName, string>;
  genesis: Map<CircuitName, string>;
  finalZkey: Map<CircuitName, string>;
  finalVk: Map<CircuitName, string>;
}

export interface VerifyContext {
  options: VerifyOptions;
  report: Report;
  stage: Stage;
  announcement: Loaded<CeremonyAnnouncement>;
  init: Loaded<InitRecord>;
  transcript: Transcript;
  files: StagedFiles;
  failed: Failed;
}
