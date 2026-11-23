/**
 * SPEC §2.5 checks 0–4 on an upload's bytes, cheapest first and without pairings: claim format,
 * file hash, stale head, canonical layout and the genesis' header, continuity, the header δ equal
 * to the new entry's, then h_k recomputed from the bytes.
 */
import { checkZkeyStructure, readMpcParams } from "../../formats/mpc";
import { FormatError } from "../../primitives/errors";
import { sha256Hex } from "../../primitives/hashing";
import { normalizeHex } from "../../primitives/schema";
import { checkContinuity, type HeadExpectation } from "./continuity";
import { checkAgainstGenesis, type GenesisLayout } from "./genesis";
import type { VerificationResult } from "./contract";
import { isStaleHead } from "./limits";

/** The hashes a contributor declares with an upload (a `ContributionClaim` is one too). */
export interface UploadClaim {
  /** SHA-256 of the head the contributor downloaded. */
  inputSha256: string;
  outputSha256: string;
  /** h_k as reported by the client; never trusted, only compared. */
  contributionHash: string;
}

/** The head an upload must extend: its file hash and its MPC chain. */
export interface CurrentHead extends HeadExpectation {
  outputSha256: string;
}

type Rejected = Extract<VerificationResult, { result: "rejected" }>;

/** The new entry's fields, or a definitive rejection. */
type PrecheckResult =
  | { ok: true; index: number; contributionHash: string; deltaAfter: string; name: string }
  | (Rejected & { ok: false });

const reject = (reason: Rejected["reason"], detail?: string): PrecheckResult => ({
  ok: false,
  result: "rejected",
  reason,
  ...(detail ? { detail } : {}),
});

function normalizeClaim(claim: UploadClaim): UploadClaim | string {
  try {
    return {
      inputSha256: normalizeHex(claim.inputSha256, "inputSha256", 32),
      outputSha256: normalizeHex(claim.outputSha256, "outputSha256", 32),
      contributionHash: normalizeHex(claim.contributionHash, "contributionHash", 64),
    };
  } catch (error) {
    return error instanceof FormatError ? error.message : "malformed claim";
  }
}

/**
 * Runs the pre-checks; only a passing upload goes on to `zkvi`. Parsing is bounded by the head,
 * and every field snarkjs sizes allocations from must be the genesis' (`genesisLayoutOf`).
 */
export function precheckUpload(
  zkey: Uint8Array,
  rawClaim: UploadClaim,
  head: CurrentHead,
  genesis: GenesisLayout,
): PrecheckResult {
  const claim = normalizeClaim(rawClaim);
  if (typeof claim === "string") return reject("malformed-claim", claim);
  if (sha256Hex(zkey) !== claim.outputSha256) return reject("output-hash-mismatch");
  if (isStaleHead(claim, head)) return reject("stale-head");

  let params;
  let headerDelta;
  try {
    checkZkeyStructure(zkey);
    headerDelta = checkAgainstGenesis(zkey, genesis);
    params = readMpcParams(zkey, {
      maxEntries: head.previous.length + 1,
      subgroupFrom: head.previous.length,
    });
  } catch (error) {
    if (error instanceof FormatError) return reject("malformed", error.message);
    throw error;
  }

  const continuity = checkContinuity(params, head);
  if (!continuity.ok) return reject(continuity.reason);

  const { hash, deltaAfter, name } = continuity.contribution;
  if (deltaAfter !== headerDelta) {
    return reject("malformed", "Groth16 header δ differs from the new entry's δ");
  }
  if (hash !== claim.contributionHash) return reject("client-hash-mismatch");
  return {
    ok: true,
    index: continuity.index,
    contributionHash: hash,
    deltaAfter,
    name: name ?? "",
  };
}
