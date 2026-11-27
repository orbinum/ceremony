/**
 * Whether a final record must carry `vk_hash`, which binds the final key to what the chain stores:
 * only a local ceremony, which never reaches a chain, may leave it null.
 */
import type { CeremonyAnnouncement } from "../../announcement";

export const vkHashRequired = (announcement: CeremonyAnnouncement): boolean =>
  announcement.network !== "local";
