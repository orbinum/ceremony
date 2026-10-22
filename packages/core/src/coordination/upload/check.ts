/**
 * Whether an upload may be stored and verified now (SPEC §2.5, §4.1): the caller's claimed, idle
 * slot, the next circuit in order, a claim that extends the current head, and a size within the
 * bound. The same checks run before the bytes move and again once they are stored; the step
 * applies every deadline that passed first, so nothing is accepted after the close.
 */
import type { CircuitName } from "../../config";
import { type Chained, genesisOf, type Setup } from "../../ceremony";
import { isStaleHead, maxUploadSize } from "../../verification";
import type { CeremonyRefusal, ContributionClaim, JobId } from "../protocol";
import { headOfSetup, type QueueState, step, type StepResult } from "../queue";

/** An upload as the route received it. */
export interface UploadRequest {
  githubId: number;
  circuit: CircuitName;
  claim: ContributionClaim;
  size: number;
}

/** An accepted check: the step to commit, the job it creates and what its verifier needs. */
interface CheckedUpload {
  ok: true;
  result: Extract<StepResult, { ok: true }>;
  job: JobId & { index: number };
  head: NonNullable<ReturnType<typeof headOfSetup>>;
  genesisSha256: string;
}

/** Checks `upload` against the state at `now`. */
export function checkUpload(
  setup: Setup,
  state: QueueState,
  records: readonly Chained[],
  upload: UploadRequest,
  now: number,
): CheckedUpload | { ok: false; refusal: CeremonyRefusal } {
  const { githubId, circuit, claim, size } = upload;
  const result = step(state, { type: "uploaded", githubId, circuit }, now);
  if (!result.ok) return { ok: false, refusal: result.refusal };
  const head = headOfSetup(setup, records, circuit);
  const genesis = genesisOf(setup, circuit);
  const genesisSize = setup.genesisSizes[circuit];
  const slot = result.state.slot;
  const entry = slot?.circuits.find((c) => c.circuit === circuit);
  if (!head || !genesis || genesisSize === undefined || !slot || !entry) {
    return { ok: false, refusal: "out-of-order" };
  }
  if (isStaleHead(claim, head)) return { ok: false, refusal: "stale-head" };
  if (size > maxUploadSize(genesisSize, head.index + 1)) return { ok: false, refusal: "too-large" };
  return {
    ok: true,
    result,
    head,
    genesisSha256: genesis.genesis_sha256,
    job: { seq: slot.seq, circuit, attempt: entry.uploads, index: head.index + 1 },
  };
}
