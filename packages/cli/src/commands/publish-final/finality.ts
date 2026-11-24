/**
 * The finalization a local transcript makes, refused unless it is final: every core check passes,
 * the sealed beacon is its last record, and each circuit has one final record bound to it.
 */
import {
  checkFinalRecord,
  checkTranscript,
  circuitsOf,
  type FinalizeRequest,
  validateFinalizeRequest,
} from "@orbinum-ceremony/core";
import { loadCeremony } from "../../artifacts";
import { openTranscript } from "../../store";

/** The finalization request from the local transcript, refused unless it is final. */
export async function readFinalization(dir: string) {
  const { announcement, init } = await loadCeremony(dir);
  const { transcript } = await openTranscript(dir, announcement);
  const { records, finals } = transcript;
  const beacon = records.at(-1);
  if (beacon?.type !== "beacon") {
    throw new Error("transcript.json does not end with a sealed beacon: run finalize first");
  }
  const { checks } = checkTranscript(
    transcript,
    announcement.value,
    announcement.sha256,
    init.value,
  );
  const problems = checks.flatMap((c) => c.problems.map((p) => `${c.id}: ${p}`));
  for (const c of init.value.circuits) {
    const final = finals.find((f) => f.circuit === c.name);
    if (!final) {
      problems.push(`${c.name}: no final record`);
      continue;
    }
    const wrong = checkFinalRecord(final, records, c, announcement.value);
    problems.push(...wrong.map((p) => `${c.name} final: ${p}`));
  }
  if (finals.length !== circuitsOf(init.value).length) {
    problems.push("one final record per circuit");
  }
  if (problems.length > 0) throw new Error(`not final: ${problems.join("; ")}`);
  const request: FinalizeRequest = validateFinalizeRequest({ beacon, finals });
  return { id: announcement.value.ceremony_id, request };
}
