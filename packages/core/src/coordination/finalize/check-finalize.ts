/**
 * Whether the operator's finalization seals this ceremony: the queue CLOSED with no session left,
 * the transcript finalizable, the beacon chained right after the transcript's head, one final
 * record per circuit bound to it, and the sealed transcript passing every `checkTranscript` check.
 * A refusal lists every problem found. On success the coordinator publishes the `final/` files the
 * finals pin, appends the beacon (the `finalized` effect) and keeps the finals; a sealed ceremony
 * refuses every event after. The request's circuits are already distinct
 * (`validateFinalizeRequest`), so as many as the ceremony's and all known means all of them.
 */
import {
  appendRecord,
  type BeaconRecord,
  type Chained,
  checkFinalizable,
  checkFinalRecord,
  checkKnownFinals,
  checkTranscript,
  circuitsOf,
  type FinalRecord,
  finalFiles,
  headChain,
  type Setup,
  transcriptOf,
} from "../../ceremony";
import type { CeremonyRefusal, FinalizeRequest } from "../protocol";
import { type QueueState, step, type StepResult } from "../queue";

interface CheckedFinalize {
  ok: true;
  result: Extract<StepResult, { ok: true }>;
  beacon: BeaconRecord;
  finals: FinalRecord[];
  files: { key: string; sha256: string }[];
}

export function checkFinalize(
  setup: Setup,
  state: QueueState,
  records: readonly Chained[],
  request: FinalizeRequest,
  now: number,
): CheckedFinalize | { ok: false; refusal: CeremonyRefusal; problems: string[] } {
  const result = step(state, { type: "finalize" }, now);
  if (!result.ok) return { ok: false, refusal: result.refusal, problems: [] };

  const { announcement, init } = setup;
  const { prev_chain, chain, ...beacon } = request.beacon;
  const problems: string[] = [];
  if (prev_chain !== headChain(records, setup.chainGenesis)) {
    problems.push("the beacon does not follow the transcript's head: it moved since the download");
  }
  const sealed = appendRecord(records, setup.chainGenesis, beacon);
  if (sealed.chain !== chain) problems.push("the beacon's chain value is not its own");
  if (Date.parse(beacon.sealed_at) > now) problems.push("the beacon is sealed in the future");
  problems.push(...checkFinalizable(records, init, announcement, now));

  const all = [...records, sealed];
  const circuits = circuitsOf(init);
  if (
    request.finals.length !== circuits.length ||
    checkKnownFinals(request.finals, init).length > 0
  ) {
    problems.push(`one final record per circuit is required: ${circuits.join(", ")}`);
  }
  for (const f of request.finals) {
    const circuit = init.circuits.find((c) => c.name === f.circuit);
    if (!circuit) continue;
    problems.push(
      ...checkFinalRecord(f, all, circuit, announcement).map((p) => `${f.circuit} final: ${p}`),
    );
  }
  const transcript = transcriptOf(
    announcement.ceremony_id,
    setup.announcementSha256,
    all,
    request.finals,
  );
  const { checks } = checkTranscript(transcript, announcement, setup.announcementSha256, init);
  problems.push(...checks.flatMap((c) => c.problems.map((p) => `${c.id}: ${p}`)));

  if (problems.length > 0) return { ok: false, refusal: "not-finalizable", problems };
  return { ok: true, result, beacon, finals: request.finals, files: finalFiles(request.finals) };
}
