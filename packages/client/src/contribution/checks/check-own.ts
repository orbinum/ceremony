/**
 * The browser's own output passes the very pre-checks the verifier runs, with core's rules, before
 * a byte is uploaded: it extends `input` (whose chain is `params`) by exactly one entry, at
 * `index`, with the claimed hashes.
 */
import { genesisLayoutOf, type MpcParams, precheckUpload } from "@orbinum-ceremony/core";
import { CheckFailed } from "./check-failed";

export interface OwnClaim {
  inputSha256: string;
  outputSha256: string;
  contributionHash: string;
}

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
