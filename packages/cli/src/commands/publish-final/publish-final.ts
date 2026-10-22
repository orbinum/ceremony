/**
 * `publish-final`: hands the finalization to the coordinator (SPEC §2.6, §6.1). The local
 * transcript must be final (every core check passes, the sealed beacon is its last record, one
 * final record per circuit); every `final/` file is checked against its record, then uploaded
 * (immutable, hash-checked by the bucket); last, the chained beacon and the finals are posted, and
 * the coordinator checks them against its own transcript before it freezes the ceremony. A re-run
 * is a no-op: the same bytes upload again as unchanged, and a ceremony already sealed with this
 * very beacon and these finals counts as done.
 */
import { join } from "node:path";
import {
  ADMIN_PATHS,
  canonicalJson,
  CEREMONY_LAYOUT,
  checkFinalRecord,
  checkTranscript,
  circuitsOf,
  CONTENT_SHA256_HEADER,
  createSha256,
  type FinalizeRequest,
  finalFiles,
  MAX_TRANSCRIPT_BYTES,
  sha256Hex,
  validateFinalizeRequest,
  validateTranscript,
} from "@orbinum-ceremony/core";
import { layout, loadCeremony } from "../../artifacts";
import { AdminRefusal, adminCall, hashFile, publicJson, readBytes } from "../../io";
import { openTranscript, withLock } from "../../store";
import type { Command } from "../types";
import { PUBLISH_FINAL_USAGE, type PublishFinalOptions, parsePublishFinalOptions } from "./options";

/** The finalization request from the local transcript, refused unless it is final. */
async function readFinalization(dir: string) {
  const { announcement, init } = await loadCeremony(dir);
  const { transcript } = await openTranscript(dir, announcement, init.value);
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
    if (!final) problems.push(`${c.name}: no final record`);
    else
      problems.push(
        ...checkFinalRecord(final, records, c, announcement.value).map(
          (p) => `${c.name} final: ${p}`,
        ),
      );
  }
  if (finals.length !== circuitsOf(init.value).length)
    problems.push("one final record per circuit");
  if (problems.length > 0) throw new Error(`not final: ${problems.join("; ")}`);
  const request: FinalizeRequest = validateFinalizeRequest({ beacon, finals });
  return { id: announcement.value.ceremony_id, request };
}

/** Whether the coordinator's published transcript is sealed with exactly `request`. */
async function sealedWith(origin: string, request: FinalizeRequest): Promise<boolean> {
  const path = `/artifacts/${CEREMONY_LAYOUT.transcript}`;
  const published = validateTranscript(await publicJson(origin, path, MAX_TRANSCRIPT_BYTES));
  return (
    published.records.at(-1)?.chain === request.beacon.chain &&
    canonicalJson(published.finals) === canonicalJson(request.finals)
  );
}

/** Publishes the final files and seals the ceremony; returns the sealed beacon's chain value. */
export async function runPublishFinal(options: PublishFinalOptions): Promise<string> {
  return withLock(layout(options.dir).lock, async () => {
    const { id, request } = await readFinalization(options.dir);
    const files = finalFiles(request.finals);
    // Checked here first: nothing is uploaded unless every file is the one its record pins.
    for (const { key, sha256 } of files) {
      // oxlint-disable-next-line no-await-in-loop -- a few files, hashed in order
      if ((await hashFile(join(options.dir, key), createSha256())) !== sha256) {
        throw new Error(`${key}: does not match its final record`);
      }
    }
    for (const { key, sha256 } of files) {
      /* oxlint-disable no-await-in-loop -- one upload at a time (final keys are ~17 MB) */
      const bytes = await readBytes(join(options.dir, key));
      if (sha256Hex(bytes) !== sha256) throw new Error(`${key}: changed while being published`);
      const answer = await adminCall(
        options.coordinator,
        "PUT",
        ADMIN_PATHS.artifact(key),
        { [CONTENT_SHA256_HEADER]: sha256 },
        bytes,
      );
      /* oxlint-enable no-await-in-loop */
      if (answer.key !== key) throw new Error(`PUT ${key}: the coordinator stored another key`);
      console.log(`published ${key}`);
    }
    try {
      await adminCall(
        options.coordinator,
        "POST",
        ADMIN_PATHS.finalize,
        { "content-type": "application/json" },
        JSON.stringify(request),
      );
    } catch (error) {
      // A re-run after a success: done only if the ceremony is sealed with this very beacon.
      if (!(error instanceof AdminRefusal && error.code === "finalized")) throw error;
      if (!(await sealedWith(options.coordinator, request))) {
        throw new Error("the coordinator is finalized with another beacon or other finals", {
          cause: error,
        });
      }
      console.log("already finalized with this beacon and these finals");
    }
    console.log(
      `finalized ${id}: drand round ${request.beacon.round}, ${files.length} final files`,
    );
    return request.beacon.chain;
  });
}

/** `publish-final` as the entry point runs it. */
export const publishFinalCommand: Command = {
  summary: "Publish final/ and hand the sealed beacon and finals to the coordinator (SPEC §2.6)",
  usage: PUBLISH_FINAL_USAGE,
  run: async (argv) => {
    await runPublishFinal(parsePublishFinalOptions(argv));
  },
};
