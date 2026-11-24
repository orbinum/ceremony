/**
 * One contribution to one circuit (SPEC §2.4–2.5): the head, checked against the announced hash,
 * the circuit's anchored csHash and the transcript; a snarkjs child that draws the randomness
 * itself (no secret ever reaches this process); the verifier's own pre-checks on the output; the
 * upload; and its verdict. The public bytes this process holds are zeroed and their files removed
 * whatever happens.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type CircuitName,
  type ClientInfo,
  type ContributionClaim,
  genesisLayoutOf,
  MAX_FILE_BYTES,
  type MpcParams,
  precheckUpload,
  readMpcParams,
  sha256Hex,
} from "@orbinum-ceremony/core";
import { type Contributor, fetchAnnounced } from "../../io";
import { contribute } from "../../tools";
import { type Anchors, assertRecordedHead } from "./anchors";
import { headOf, upload, type Verdict, verdictOf } from "./api";
import { isTransient, refusedWith, sleep } from "./retry";

const RESULT_POLL_MS = 2_000;
/** A verdict takes seconds; past this the coordinator's own deadline has long passed. */
const RESULT_TIMEOUT_MS = 15 * 60_000;

/** One accepted contribution, as the records and the attestation name it. */
export interface ContributionSummary {
  circuit: CircuitName;
  index: number;
  inputSha256: string;
  outputSha256: string;
  contributionHash: string;
}

/** What one contribution needs. */
export interface Step {
  who: Contributor;
  circuit: CircuitName;
  csHash: string;
  anchors: Anchors;
  seq: number;
  client: ClientInfo;
  work: string;
  signal?: AbortSignal;
}

/** A contribution that got a verdict, or one to try again (the upload did not land). */
export type Attempt =
  | { verdict: Verdict; summary: ContributionSummary }
  | { verdict: null; why: string };

/**
 * The verdict of this session's latest upload of `circuit` (of exactly `outputSha256` when given),
 * once it has one.
 */
export async function settled(
  who: Contributor,
  circuit: CircuitName,
  seq: number,
  outputSha256: string | null,
  signal?: AbortSignal,
): Promise<Verdict> {
  const deadline = Date.now() + RESULT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const v = await verdictOf(who, circuit, signal);
    const ours = v && v.seq === seq && (outputSha256 === null || v.outputSha256 === outputSha256);
    if (ours && v.status !== "pending") return v;
    await sleep(RESULT_POLL_MS, signal);
  }
  throw new Error(`${circuit}: no verdict after ${RESULT_TIMEOUT_MS / 60_000} min`);
}

/** The head as the verifier's pre-check expects it: its entries and its key. */
const expectationOf = (params: MpcParams, csHash: string, outputSha256: string) => ({
  csHash,
  previous: params.entries.map((e) => ({
    hash: e.hash,
    name: e.name ?? "",
    deltaAfter: e.deltaAfter,
  })),
  outputSha256,
});

/**
 * Uploads `output` under `claimed`; null once it landed, or why it did not. An answer lost after
 * the upload landed is found by its verdict: this session's latest upload of these exact bytes.
 */
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

/** One contribution to `circuit`, from its head to its verdict. */
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
    // An empty entropy: the child draws it, so this process never holds it (SPEC §2.4).
    const contributionHash = await contribute(inPath, outPath, String(seq), "");
    output = new Uint8Array(await readFile(outPath));
    const claimed: ContributionClaim = {
      inputSha256: head.outputSha256,
      outputSha256: sha256Hex(output),
      contributionHash,
      method: "cli",
      client: step.client,
    };
    // The verifier's own pre-checks, before a byte is uploaded: a fault is caught here.
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
