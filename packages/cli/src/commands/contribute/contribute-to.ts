/**
 * One contribution to one circuit, from its head to its verdict: the head, checked against the
 * announced hash, the circuit's anchored csHash and the transcript; a snarkjs child that draws the
 * randomness itself (an empty entropy is passed, so no secret ever reaches this process); the
 * verifier's own pre-checks on the output, so a fault is caught before a byte is uploaded; the
 * upload; and its verdict. An answer lost after the upload landed is found by its verdict (this
 * session's latest upload of these exact bytes). The public bytes this process holds are zeroed and
 * their files removed whatever happens.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type ContributionClaim,
  genesisLayoutOf,
  MAX_FILE_BYTES,
  type MpcParams,
  precheckUpload,
  readMpcParams,
  sha256Hex,
} from "@orbinum-ceremony/core";
import { fetchAnnounced } from "../../io";
import { contribute } from "../../tools";
import { assertRecordedHead } from "./anchors";
import { headOf, upload, verdictOf } from "./coordinator";
import { isTransient, refusedWith } from "./retry";
import { settled } from "./settled";
import type { Attempt, ContributionSummary, Step } from "./types";

const expectationOf = (params: MpcParams, csHash: string, outputSha256: string) => ({
  csHash,
  previous: params.entries.map((e) => ({
    hash: e.hash,
    name: e.name ?? "",
    deltaAfter: e.deltaAfter,
  })),
  outputSha256,
});

async function uploaded(
  step: Step,
  claimed: ContributionClaim,
  output: Uint8Array,
): Promise<string | null> {
  const { who, circuit, seq, signal } = step;
  try {
    await upload(who, circuit, claimed, output, signal);
    return null;
  } catch (error) {
    if (refusedWith(error, "not-open")) return "the ceremony paused meanwhile";
    if (!isTransient(error) || signal?.aborted) throw error;
    const v = await verdictOf(who, circuit, signal);
    return v && v.seq === seq && v.outputSha256 === claimed.outputSha256
      ? null
      : "the upload did not go through";
  }
}

export async function contributeTo(step: Step): Promise<Attempt> {
  const { who, circuit, seq, signal } = step;
  const head = await headOf(who, circuit, signal);
  const dir = await mkdtemp(join(step.work, `${circuit}-`));
  let input: Uint8Array = new Uint8Array();
  let output: Uint8Array = new Uint8Array();
  try {
    input = await fetchAnnounced(who.origin, head.url, head.outputSha256, MAX_FILE_BYTES);
    const params = readMpcParams(input);
    if (params.csHash !== step.csHash) {
      throw new Error(`${circuit}: the head is not the announced circuit's (csHash differs)`);
    }
    await assertRecordedHead(
      who,
      step.anchors,
      circuit,
      { entries: params.entries, sha256: head.outputSha256 },
      signal,
    );
    const inPath = join(dir, "head.zkey");
    const outPath = join(dir, "contribution.zkey");
    await writeFile(inPath, input, { mode: 0o600, flag: "wx" });
    const contributionHash = await contribute(inPath, outPath, String(seq), "");
    output = new Uint8Array(await readFile(outPath));
    const claimed: ContributionClaim = {
      inputSha256: head.outputSha256,
      outputSha256: sha256Hex(output),
      contributionHash,
      method: "cli",
      client: step.client,
    };
    const pre = precheckUpload(
      output,
      claimed,
      expectationOf(params, step.csHash, head.outputSha256),
      genesisLayoutOf(input),
    );
    if (!pre.ok || pre.index !== head.index + 1) {
      throw new Error(`${circuit}: the contribution fails its own check`);
    }
    if (signal?.aborted) throw new Error("interrupted");
    const why = await uploaded(step, claimed, output);
    if (why !== null) return { verdict: null, why };
    const verdict = await settled(who, circuit, seq, claimed.outputSha256, signal);
    const summary: ContributionSummary = {
      circuit,
      index: head.index + 1,
      inputSha256: head.outputSha256,
      outputSha256: claimed.outputSha256,
      contributionHash,
    };
    return { verdict, summary };
  } finally {
    input.fill(0);
    output.fill(0);
    await rm(dir, { recursive: true, force: true });
  }
}
