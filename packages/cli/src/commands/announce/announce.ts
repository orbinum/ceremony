/** `announce`: writes `ceremony.json`, the ceremony's root of trust. SPEC §6.2. */
import { existsSync } from "node:fs";
import {
  buildAnnouncement,
  type CeremonyAnnouncement,
  DRAND,
  roundTime,
  serializeJson,
  sha256Hex,
  utf8,
} from "@orbinum-ceremony/core";
import { layout, loadInit } from "../../artifacts";
import { writeAtomic } from "../../io";
import { resolveRelease } from "../../source";
import { withLock } from "../../store";
import type { Command } from "../types";
import { ANNOUNCE_USAGE, type AnnounceOptions, parseAnnounceOptions } from "./options";

/**
 * Writes `ceremony.json` (SPEC §6.2): the ceremony's root of trust. It pins the exact `init.json`,
 * the audited circuits tag and commit, the minimum contributions and the drand round, so none of
 * them can be chosen after contributions open. Its SHA-256 is what gets published.
 */
export async function runAnnounce(
  options: AnnounceOptions,
): Promise<{ announcement: CeremonyAnnouncement; sha256: string }> {
  return withLock(layout(options.dir).lock, () => announce(options));
}

async function announce(options: AnnounceOptions) {
  const paths = layout(options.dir);
  if (existsSync(paths.announcement) && !options.force) {
    throw new Error(
      "ceremony.json already exists: an announcement is never rewritten (use --force only before publishing)",
    );
  }
  // A transcript is anchored in the announcement: rewriting it would orphan the chain.
  if (existsSync(paths.transcript)) {
    throw new Error("transcript.json exists: the announcement it is anchored in cannot change");
  }

  const init = await loadInit(options.dir);
  const release = await resolveRelease(
    options.circuitsRepo,
    options.circuitsTag,
    init.value.source.commit,
  );

  const announcement = buildAnnouncement({
    ceremonyId: init.value.ceremony_id,
    network: options.network,
    initSha256: init.sha256,
    circuitsSource: { repo: options.circuitsUrl, tag: release.tag, commit: release.commit },
    minContributions: options.minContributions,
    open: options.open,
    close: options.close,
    beaconDelaySeconds: options.beaconDelaySeconds,
  });

  const bytes = utf8(serializeJson(announcement));
  await writeAtomic(paths.announcement, bytes);
  const sha256 = sha256Hex(bytes);

  const beaconAt = new Date(roundTime(announcement.beacon.round) * 1000).toISOString();
  console.log(`wrote ${paths.announcement}`);
  console.log(
    `  ceremony ${announcement.ceremony_id} (${announcement.network}), circuits ${release.tag} @ ${release.commit}`,
  );
  console.log(
    `  contributions ${announcement.schedule.open} → ${announcement.schedule.close}, min ${announcement.min_contributions} per circuit`,
  );
  console.log(`  beacon: drand ${DRAND.network} round ${announcement.beacon.round} (${beaconAt})`);
  console.log(`\nPublish this SHA-256 on the official channels before opening:\n  ${sha256}`);
  return { announcement, sha256 };
}

/** `announce` as the entry point runs it. */
export const announceCommand: Command = {
  summary: "Write ceremony.json (the root of trust) and print the SHA-256 to publish",
  usage: ANNOUNCE_USAGE,
  run: async (argv) => {
    await runAnnounce(parseAnnounceOptions(argv));
  },
};
