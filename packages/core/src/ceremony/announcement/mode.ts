/**
 * What a public verification of an announced ceremony must cover. A local ceremony is verified in
 * local mode, where checks that need external inputs (the circuits repo, the vk packer, the
 * independent verifier) may be skipped; any other network is verified in full. SPEC §9.
 */
import type { CeremonyAnnouncement } from "./types";

/** The verification mode matches the announced network. */
export function checkVerifyMode(announcement: CeremonyAnnouncement, local: boolean): string[] {
  const isLocal = announcement.network === "local";
  if (isLocal === local) return [];
  return [
    isLocal
      ? "a local ceremony needs --local"
      : `--local cannot verify a ${announcement.network} ceremony`,
  ];
}

/**
 * How a check that did not run counts: a skipped security check (one that binds the ceremony to
 * something external) fails a full verification; it is only a skip in local mode.
 */
export const skippedCheckStatus = (security: boolean, local: boolean): "skip" | "fail" =>
  security && !local ? "fail" : "skip";
