/**
 * Record constructors: every record any component writes is built and validated here. SPEC §6.3.
 */
import type { CircuitName } from "../../config";
import { normalizeSignature } from "../../primitives/encoding";
import type { DrandRound } from "../beacon";
import type {
  AttestationPayload,
  ClientInfo,
  ContributionMethod,
  Identity,
  Scheme,
} from "../identity";
import type { CeremonyState } from "../lifecycle";
import type {
  AttestationRecord,
  BeaconRecord,
  ContributionRecord,
  FinalRecord,
  StateRecord,
} from "./types";
import { validateRecord } from "./validate";

/** What a contributor claimed with the upload. */
export interface ContributionClaimed {
  inputSha256: string;
  outputSha256: string;
  /** h_k as the client computed it. */
  contributionHash: string;
  method: ContributionMethod;
  client: ClientInfo;
}

/** What the verifier established from the bytes. */
interface ContributionVerified {
  contributionHash: string;
  zkeyName: string;
  deltaAfter: string;
  logSha256: string;
  verifierVersion: string;
  snarkjsVersion: string;
}

/** Everything a contribution record is made of. */
export interface ContributionInput {
  ceremonyId: string;
  seq: number;
  circuit: CircuitName;
  index: number;
  claimed: ContributionClaimed;
  verified: ContributionVerified;
  /** The linked wallet, the link it signed and its signature; null for simulated contributions. */
  contributor: (Identity & { linkSignature: string }) | null;
  /** When the verifier's result was accepted (ISO). */
  at: string;
}

/** A validated contribution record; throws `FormatError` on any field out of bounds. */
export function buildContributionRecord(input: ContributionInput): ContributionRecord {
  const { claimed, verified, contributor } = input;
  return validateRecord({
    type: "contribution",
    ceremony_id: input.ceremonyId,
    seq: input.seq,
    circuit: input.circuit,
    index: input.index,
    input_sha256: claimed.inputSha256,
    output_sha256: claimed.outputSha256,
    contribution_hash: verified.contributionHash,
    client_contribution_hash: claimed.contributionHash,
    zkey_name: verified.zkeyName,
    delta_after: verified.deltaAfter,
    method: claimed.method,
    client: claimed.client,
    identity: contributor && {
      github_id: contributor.github_id,
      github_login: contributor.github_login,
      account: contributor.account,
      scheme: contributor.scheme,
      nonce: contributor.nonce,
      issued_at: contributor.issued_at,
    },
    link_sig: contributor && normalizeSignature(contributor.linkSignature),
    gist_url: null,
    verified_by: {
      verifier_version: verified.verifierVersion,
      snarkjs_version: verified.snarkjsVersion,
      at: input.at,
    },
    verifier_log_sha256: verified.logSha256,
  } satisfies ContributionRecord) as ContributionRecord;
}

/** A validated attestation record for a payload the wallet of `scheme` signed. */
export const buildAttestationRecord = (
  payload: AttestationPayload,
  scheme: Scheme,
  signature: string,
): AttestationRecord =>
  validateRecord({
    type: "attestation",
    ceremony_id: payload.ceremony_id,
    seq: payload.seq,
    payload,
    scheme,
    signature: normalizeSignature(signature),
  } satisfies AttestationRecord) as AttestationRecord;

/** A validated lifecycle transition. */
export const buildStateRecord = (
  ceremonyId: string,
  change: { from: CeremonyState; to: CeremonyState; reason: string },
  at: string,
): StateRecord =>
  validateRecord({
    type: "state",
    ceremony_id: ceremonyId,
    ...change,
    at,
  } satisfies StateRecord) as StateRecord;

/** A validated beacon record for a verified drand round and the relays that agreed on it. */
export const buildBeaconRecord = (input: {
  ceremonyId: string;
  chainHash: string;
  round: DrandRound;
  iterationsExp: number;
  relays: string[];
  sealedAt: string;
}): BeaconRecord =>
  validateRecord({
    type: "beacon",
    ceremony_id: input.ceremonyId,
    source: "drand",
    chain_hash: input.chainHash,
    round: input.round.round,
    randomness: input.round.randomness,
    signature: input.round.signature,
    iterations_exp: input.iterationsExp,
    relays: input.relays,
    sealed_at: input.sealedAt,
  } satisfies BeaconRecord) as BeaconRecord;

/** A final record (the transcript validates it with the document). */
export const buildFinalRecord = (input: {
  circuit: CircuitName;
  contributions: number;
  finalZkeySha256: string;
  vkJsonSha256: string;
  vkHash: string | null;
  csHash: string;
  finalChain: string;
}): FinalRecord => ({
  circuit: input.circuit,
  contributions: input.contributions,
  final_zkey_sha256: input.finalZkeySha256,
  vk_json_sha256: input.vkJsonSha256,
  vk_hash: input.vkHash,
  cs_hash: input.csHash,
  delta_neq_gamma: true,
  final_chain: input.finalChain,
});
