/**
 * The contributions of one turn (SPEC §4.1), circuit by circuit in the queue's order, following
 * the queue's own rules: a rejection is tried again while the slot offers the circuit, `infra` and
 * `stale` wait for the coordinator, a pause waits for the operator. Each contribution downloads
 * the head, checks it, computes in a worker, checks its own output, uploads it and waits for the
 * verdict; the bytes it held are zeroed whatever happens.
 */
import { ApiError, isTransient } from "../api";
import { CheckFailed, checkHead, checkOwn } from "./checks";
import { retrying } from "./retry";
import type { Accepted, Progress, RunDeps, Verdict } from "./types";
import { type CircuitName, sha256Hex } from "@orbinum-ceremony/core";

const POLL_MS = 2_000;
/** A verdict takes seconds; past this the coordinator's own deadline has long passed. */
const VERDICT_FOR_MS = 15 * 60_000;
/** Contributions to one circuit in one turn: rejections and lost uploads are bounded. */
const MAX_ATTEMPTS = 4;

/** The verdict of this turn's upload of exactly `outputSha256`, once it has one. */
async function settled(
  deps: RunDeps,
  circuit: CircuitName,
  seq: number,
  outputSha256: string | null,
): Promise<{ status: NonNullable<Verdict>; reason?: string }> {
  const deadline = Date.now() + VERDICT_FOR_MS;
  while (Date.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop -- polls the verdict
    const r = await retrying(() => deps.api.getResult(circuit), deps.sleep);
    const ours = r.seq === seq && (outputSha256 === null || r.output_sha256 === outputSha256);
    // `null`: a job ended without an outcome yet; it is as good as pending.
    if (ours && r.status !== "pending" && r.status !== null) {
      return { status: r.status, reason: r.reason };
    }
    // oxlint-disable-next-line no-await-in-loop -- polls the verdict
    await deps.sleep(POLL_MS);
  }
  throw new Error(`${circuit}: no verdict after ${VERDICT_FOR_MS / 60_000} minutes`);
}

/** One attempt at `circuit`: its verdict and what it uploaded, or null if the upload never landed. */
async function contributeTo(
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
      // Paused while this was computed: the loop waits, then tries again.
      if (error instanceof ApiError && error.code === "not-open") return null;
      if (!isTransient(error)) throw error;
      // The answer may be lost after the upload landed: then this turn's latest upload is
      // exactly these bytes, and its verdict is awaited as usual.
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

/**
 * Contributes to every circuit the turn `seq` still offers; returns this run's accepted ones.
 * Throws if the turn is lost or a check fails (nothing more is uploaded then).
 */
export async function contributeAll(
  deps: RunDeps,
  seq: number,
  report: (p: Progress) => void,
): Promise<Accepted[]> {
  const accepted = new Map<CircuitName, Accepted>();
  const attempts = new Map<CircuitName, number>();
  for (;;) {
    const lost = deps.lost();
    if (lost) throw lost;
    // oxlint-disable-next-line no-await-in-loop -- one circuit after the other (SPEC §4.1)
    const view = await retrying(() => deps.api.getSlot(), deps.sleep);
    // A turn whose every circuit is done closes itself.
    if (!view.slot || view.slot.seq !== seq) break;
    // An upload of an earlier attempt still in verification: let it settle first.
    const pending = view.slot.circuits.find((c) => c.status === "verifying");
    if (pending) {
      // oxlint-disable-next-line no-await-in-loop -- one verdict at a time
      await settled(deps, pending.circuit, seq, null);
      continue;
    }
    const next = view.slot.circuits.find((c) => c.status === "todo");
    if (!next) break;
    if (view.phase !== "OPEN") {
      report({ circuit: null, stage: "paused" });
      // oxlint-disable-next-line no-await-in-loop -- the turn is frozen until the operator resumes
      await deps.sleep(POLL_MS);
      continue;
    }
    const { circuit } = next;
    const tries = (attempts.get(circuit) ?? 0) + 1;
    if (tries > MAX_ATTEMPTS) throw new Error(`${circuit}: no verdict after ${MAX_ATTEMPTS} tries`);
    attempts.set(circuit, tries);
    // oxlint-disable-next-line no-await-in-loop -- one circuit after the other (SPEC §4.1)
    const attempt = await contributeTo(deps, circuit, seq, report);
    if (attempt?.verdict === "valid") {
      accepted.set(circuit, attempt.accepted);
      report({ circuit, stage: "accepted" });
      continue;
    }
    if (attempt === null) {
      report({ circuit, stage: "retrying", detail: "the upload did not go through" });
    } else if (attempt.verdict === "rejected") {
      report({ circuit, stage: "rejected", detail: attempt.reason });
    } else {
      // ambiguous (tried again), infra and stale (the verifier failed: the attempt is given back).
      report({ circuit, stage: "retrying", detail: attempt.verdict });
    }
    // oxlint-disable-next-line no-await-in-loop -- a pause before trying again
    await deps.sleep(POLL_MS);
  }
  return [...accepted.values()];
}
