/**
 * One attempt at `circuit`: download the head, check it, compute in the worker, check the output,
 * upload it and await the verdict. Null when the upload never landed: refused because the ceremony
 * paused meanwhile, or lost to a transient failure. An answer lost after the upload landed is not
 * a lost upload: the turn's latest upload is then exactly these bytes, and its verdict is awaited
 * as usual. The bytes it held are zeroed whatever happens.
 */
import { type CircuitName, sha256Hex } from "@orbinum-ceremony/core";
import { ApiError, isTransient } from "../api";
import { CheckFailed, checkHead, checkOwn } from "./checks";
import { retrying } from "./retry";
import { settled } from "./settled";
import type { Accepted, Progress, RunDeps, Verdict } from "./types";

export async function contributeTo(
  deps: RunDeps,
  circuit: CircuitName,
  seq: number,
  report: (p: Progress) => void,
): Promise<{ verdict: NonNullable<Verdict>; reason?: string; accepted: Accepted } | null> {
  const csHash = deps.csHashes.get(circuit);
  if (!csHash) throw new CheckFailed(`${circuit} is not a circuit of this ceremony`);
  report({ circuit, stage: "downloading" });
  const head = await retrying(() => deps.api.getHead(circuit), deps.sleep);
  let input: Uint8Array = new Uint8Array();
  let output: Uint8Array = new Uint8Array();
  try {
    input = await retrying(() => deps.api.download(head.url), deps.sleep);
    const params = checkHead(input, head.output_sha256, csHash);
    report({ circuit, stage: "computing" });
    const computed = await deps.compute(input, String(seq), deps.text);
    output = computed.output;
    report({ circuit, stage: "checking" });
    const claim = {
      inputSha256: head.output_sha256,
      outputSha256: sha256Hex(output),
      contributionHash: computed.contributionHash,
    };
    checkOwn(output, claim, input, params, csHash, head.index + 1);
    report({ circuit, stage: "uploading" });
    try {
      await deps.api.uploadContribution(circuit, output, {
        ...claim,
        method: "browser",
        client: deps.client,
      });
    } catch (error) {
      if (error instanceof ApiError && error.code === "not-open") return null;
      if (!isTransient(error)) throw error;
      const latest = await retrying(() => deps.api.getResult(circuit), deps.sleep).catch(
        () => null,
      );
      if (latest?.seq !== seq || latest.output_sha256 !== claim.outputSha256) return null;
    }
    report({ circuit, stage: "verifying" });
    const verdict = await settled(deps, circuit, seq, claim.outputSha256);
    return {
      verdict: verdict.status,
      reason: verdict.reason,
      accepted: { circuit, index: head.index + 1, ...claim },
    };
  } finally {
    input.fill(0);
    output.fill(0);
  }
}
