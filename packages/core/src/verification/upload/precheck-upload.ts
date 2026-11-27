/**
 * The pre-checks on an upload's bytes, cheapest first and without pairings: claim format, file
 * hash, stale head, canonical layout and the genesis' header, continuity, the header δ equal to the
 * new entry's, then h_k recomputed from the bytes. Only a passing upload goes on to `zkvi`. Parsing
 * is bounded by the head, and every field snarkjs sizes allocations from must be the genesis'.
 */
import { checkZkeyStructure, readMpcParams } from "../../formats/mpc";
import { FormatError } from "../../primitives/errors";
import { sha256Hex } from "../../primitives/hashing";
import { normalizeHex } from "../../primitives/schema";
import { checkAgainstGenesis } from "./check-against-genesis";
import { checkContinuity } from "./check-continuity";
import { isStaleHead } from "./is-stale-head";
import type { CurrentHead, GenesisLayout, UploadClaim, VerificationResult } from "./types";

type Rejected = Extract<VerificationResult, { result: "rejected" }>;

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
