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
  createSha256,
  type FinalizeRequest,
  finalFiles,
  MAX_TRANSCRIPT_BYTES,
  sha256Hex,
  validateTranscript,
} from "@orbinum-ceremony/core";
import { layout } from "../../artifacts";
import {
  CoordinatorRefusal,
  hashFile,
  postJson,
  publicJson,
  publishArtifact,
  readBytes,
} from "../../io";
import { withLock } from "../../store";
import type { Command } from "../types";
import { readFinalization } from "./finality";
import { PUBLISH_FINAL_USAGE, type PublishFinalOptions, parsePublishFinalOptions } from "./options";

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
      if ((await hashFile(join(options.dir, key), createSha256())) !== sha256) {
        throw new Error(`${key}: does not match its final record`);
      }
    }
    for (const { key, sha256 } of files) {
      const bytes = await readBytes(join(options.dir, key));
      if (sha256Hex(bytes) !== sha256) throw new Error(`${key}: changed while being published`);
      await publishArtifact(options.coordinator, key, bytes);
      console.log(`published ${key}`);
    }
    try {
      await postJson(options.coordinator, ADMIN_PATHS.finalize, request);
    } catch (error) {
      // A re-run after a success: done only if the ceremony is sealed with this very beacon.
      if (!(error instanceof CoordinatorRefusal && error.code === "finalized")) throw error;
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
