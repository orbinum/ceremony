/**
 * Whether the verification mode matches the announced network: a local ceremony is verified in
 * local mode (where checks needing external inputs may be skipped), any other network in full.
 */
import type { CeremonyAnnouncement } from "./types";

export function checkVerifyMode(announcement: CeremonyAnnouncement, local: boolean): string[] {
  const isLocal = announcement.network === "local";
  if (isLocal === local) return [];
  return [
    isLocal
      ? "a local ceremony needs --local"
      : `--local cannot verify a ${announcement.network} ceremony`,
  ];
}
