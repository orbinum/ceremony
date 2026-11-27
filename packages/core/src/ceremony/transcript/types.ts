/**
 * `transcript.json`: append-only, hash-chained records plus the per-circuit finals, anchored in the
 * exact bytes of the announcement (`ceremony.json`). A contribution's MPC entry name and δ·G1 after
 * it lie outside h_k and are recorded to pin them; its identity is null only for simulated
 * contributions (`contribute-local`), which have no participant, and its link signature is stored
 * lowercase without `0x`, null exactly when the identity is. Attestation signatures are lowercase
 * hex without `0x`, of the exact size for their scheme. A final's `vk_hash` is the blake2_256 of the
 * packed VK as the chain stores it (`0x`-hex), null only for a local ceremony. A contribution's
 * input separates what the contributor claimed (h_k as the client computed it) from what the
 * verifier established from the bytes; its contributor is null for simulated contributions, and
 * `at` is when the verifier's result was accepted (ISO).
 */
import type { CircuitName } from "../../config";
import type {
  AttestationPayload,
  ClientInfo,
  ContributionMethod,
  Identity,
  Scheme,
} from "../identity";
import type { CeremonyState } from "../lifecycle";
import type { TRANSCRIPT_SCHEMA } from "./constants";

export interface ContributionRecord {
  type: "contribution";
  ceremony_id: string;
  seq: number;
  circuit: CircuitName;
  index: number;
  input_sha256: string;
  output_sha256: string;
  contribution_hash: string;
  client_contribution_hash: string;
  zkey_name: string;
  delta_after: string;
  method: ContributionMethod;
  client: ClientInfo;
  identity: Identity | null;
  link_sig: string | null;
  gist_url: string | null;
  verified_by: { verifier_version: string; snarkjs_version: string; at: string };
  verifier_log_sha256: string;
}

export interface AttestationRecord {
  type: "attestation";
  ceremony_id: string;
  seq: number;
  payload: AttestationPayload;
  scheme: Scheme;
  signature: string;
}

export interface StateRecord {
  type: "state";
  ceremony_id: string;
  from: CeremonyState;
  to: CeremonyState;
  at: string;
  reason: string;
}

export interface BeaconRecord {
  type: "beacon";
  ceremony_id: string;
  source: "drand";
  chain_hash: string;
  round: number;
  randomness: string;
  signature: string;
  iterations_exp: number;
  relays: string[];
  sealed_at: string;
}

export type TranscriptRecord = ContributionRecord | AttestationRecord | StateRecord | BeaconRecord;

export type Chained<R extends TranscriptRecord = TranscriptRecord> = R & {
  prev_chain: string;
  chain: string;
};

export interface FinalRecord {
  circuit: CircuitName;
  contributions: number;
  final_zkey_sha256: string;
  vk_json_sha256: string;
  vk_hash: string | null;
  cs_hash: string;
  delta_neq_gamma: true;
  final_chain: string;
}

export interface Transcript {
  schema: typeof TRANSCRIPT_SCHEMA;
  ceremony_id: string;
  anchor: { file: string; sha256: string };
  records: Chained[];
  finals: FinalRecord[];
}

export interface ContributionClaimed {
  inputSha256: string;
  outputSha256: string;
  contributionHash: string;
  method: ContributionMethod;
  client: ClientInfo;
}

interface ContributionVerified {
  contributionHash: string;
  zkeyName: string;
  deltaAfter: string;
  logSha256: string;
  verifierVersion: string;
  snarkjsVersion: string;
}

export interface ContributionInput {
  ceremonyId: string;
  seq: number;
  circuit: CircuitName;
  index: number;
  claimed: ContributionClaimed;
  verified: ContributionVerified;
  contributor: (Identity & { linkSignature: string }) | null;
  at: string;
}
