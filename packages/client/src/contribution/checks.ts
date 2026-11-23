/**
 * What the browser checks around a contribution, with core's own rules: the head it downloads is
 * the one announced and the announced circuit's, and its output passes the very pre-checks the
 * verifier runs (SPEC §2.5), before a byte is uploaded.
 */
import {
  type MpcParams,
  genesisLayoutOf,
  precheckUpload,
  readMpcParams,
  sha256Hex,
} from "@orbinum-ceremony/core";

/** A check that failed: the contribution stops before anything is uploaded. */
export class CheckFailed extends Error {
  override readonly name = "CheckFailed";
}

/** The head's bytes match their announced hash and circuit; returns its MPC chain. */
export function checkHead(bytes: Uint8Array, sha256: string, csHash: string): MpcParams {
  if (sha256Hex(bytes) !== sha256) throw new CheckFailed("the download does not match its hash");
  const params = readMpcParams(bytes);
  if (params.csHash !== csHash) throw new CheckFailed("the download is not this circuit's key");
  return params;
}

/** The hashes an upload declares. */
export interface OwnClaim {
  inputSha256: string;
  outputSha256: string;
  contributionHash: string;
}

/**
 * The output extends `input` (whose chain is `params`) by exactly one entry, at `index`, with the
 * claimed hashes: what the verifier pre-checks, so a fault is caught before the upload.
 */
export function checkOwn(
  output: Uint8Array,
  claim: OwnClaim,
  input: Uint8Array,
  params: MpcParams,
  csHash: string,
  index: number,
): void {
  const result = precheckUpload(
    output,
    claim,
    {
      csHash,
      previous: params.entries.map((e) => ({
        hash: e.hash,
        name: e.name ?? "",
        deltaAfter: e.deltaAfter,
      })),
      outputSha256: claim.inputSha256,
    },
    genesisLayoutOf(input),
  );
  if (!result.ok) throw new CheckFailed(`the contribution fails its own check (${result.reason})`);
  if (result.index !== index) throw new CheckFailed("the contribution is not the next one");
}
