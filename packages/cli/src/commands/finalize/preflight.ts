/**
 * Everything that can fail is checked before the beacon is sealed, because sealing is
 * irreversible (SPEC §2.6): core's `checkTranscriptIntegrity` (anchor, chain, per-circuit links,
 * window, simulated contributions) and `checkFinalizable` (closed, minimum), the vk packer when
 * one is needed, then the pinned r1cs and head files on disk.
 */
import {
  type CeremonyAnnouncement,
  type Chained,
  checkFinalizable,
  checkTranscriptIntegrity,
  type CircuitName,
  circuitsOf,
  type ContributionRecord,
  contributionsOf,
  createSha256,
  type InitRecord,
  vkHashRequired,
} from "@orbinum-ceremony/core";
import { layout } from "../../artifacts";
import { assertPinnedFile, hashFile } from "../../io";
import type { TranscriptStore } from "../../store";
import { assertExecutable } from "../../tools";

/** One circuit's accepted chain and the head zkey the beacon is applied to. */
export interface CircuitPlan {
  circuit: CircuitName;
  accepted: Chained<ContributionRecord>[];
  headZkey: string;
}

/** Every precondition of sealing, checked; returns each circuit's plan. */
export async function preflight(
  dir: string,
  init: InitRecord,
  announcement: CeremonyAnnouncement,
  announcementSha256: string,
  store: TranscriptStore,
  now: Date,
  vkPacker: string | undefined,
): Promise<CircuitPlan[]> {
  const paths = layout(dir);
  const problems = [
    ...checkTranscriptIntegrity(store.transcript, announcement, announcementSha256, init).flatMap(
      (c) => c.problems.map((p) => `${c.id}: ${p}`),
    ),
    ...checkFinalizable(store.transcript.records, init, announcement, now.getTime()),
  ];
  if (problems.length > 0) throw new Error(`not finalizable: ${problems.join("; ")}`);
  if (vkPacker) await assertExecutable(vkPacker);
  else if (vkHashRequired(announcement)) {
    throw new Error("--vk-packer is required: vk_hash is mandatory outside local ceremonies");
  }

  const plans: CircuitPlan[] = [];
  for (const circuit of circuitsOf(init)) {
    const accepted = contributionsOf(store.transcript.records, circuit);
    const head = accepted.at(-1) as Chained<ContributionRecord>;
    const headZkey = paths.zkey(circuit, head.index);
    /* oxlint-disable no-await-in-loop -- a few files, checked in order before sealing */
    await assertPinnedFile(init, circuit, "r1cs", paths.r1cs(circuit));
    if ((await hashFile(headZkey, createSha256())) !== head.output_sha256) {
      throw new Error(`${circuit}: head zkey differs from the transcript`);
    }
    /* oxlint-enable no-await-in-loop */
    plans.push({ circuit, accepted, headZkey });
  }
  return plans;
}
