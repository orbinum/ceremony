/** `transcript.json`: append-only, hash-chained records plus the finals. SPEC §6.3–6.4. */
import type { CircuitName } from "../../config";
import type {
  AttestationPayload,
  ClientInfo,
  ContributionMethod,
  Identity,
  Scheme,
} from "../identity";
import type { CeremonyState } from "../lifecycle";

/** Schema id of the document. */
export const TRANSCRIPT_SCHEMA = "orbinum-ceremony/transcript/v1";

/** One accepted circuit contribution. */
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
  /** MPC entry name and δ·G1 after it: outside h_k, recorded to pin them. SPEC §2.5 #3. */
  zkey_name: string;
  delta_after: string;
  method: ContributionMethod;
  client: ClientInfo;
  /** `null` only for simulated contributions (`contribute-local`), which have no participant. */
  identity: Identity | null;
  /** The wallet's link signature, stored lowercase without `0x`; `null` with `identity`. */
  link_sig: string | null;
  gist_url: string | null;
  verified_by: { verifier_version: string; snarkjs_version: string; at: string };
  verifier_log_sha256: string;
}

/** The signed end of a session. SPEC §3.5. */
export interface AttestationRecord {
  type: "attestation";
  ceremony_id: string;
  seq: number;
  payload: AttestationPayload;
  scheme: Scheme;
  /** Lowercase hex without `0x`, of the exact size for `scheme`. */
  signature: string;
}

/** A lifecycle transition. SPEC §4.3. */
export interface StateRecord {
  type: "state";
  ceremony_id: string;
  from: CeremonyState;
  to: CeremonyState;
  at: string;
  reason: string;
}

/** The beacon, sealed before it is applied. SPEC §2.6, §5. */
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

/** Any record of the chain. */
export type TranscriptRecord = ContributionRecord | AttestationRecord | StateRecord | BeaconRecord;

/** A record with its place in the chain. */
export type Chained<R extends TranscriptRecord = TranscriptRecord> = R & {
  prev_chain: string;
  chain: string;
};

/** Per-circuit result of finalization. SPEC §6.4. */
export interface FinalRecord {
  circuit: CircuitName;
  contributions: number;
  final_zkey_sha256: string;
  vk_json_sha256: string;
  /** blake2_256 of the packed VK, as the chain stores it (`0x`-hex); null only when local. */
  vk_hash: string | null;
  cs_hash: string;
  delta_neq_gamma: true;
  final_chain: string;
}

/** The whole document. */
export interface Transcript {
  schema: typeof TRANSCRIPT_SCHEMA;
  ceremony_id: string;
  /** The announcement (`ceremony.json`) the chain is rooted in, by its exact bytes. SPEC §6.2. */
  anchor: { file: string; sha256: string };
  records: Chained[];
  finals: FinalRecord[];
}
