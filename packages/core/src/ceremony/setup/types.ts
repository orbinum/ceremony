/**
 * The frozen setup a coordinator is configured with. The input carries the published texts, whose
 * exact bytes the announcement pins, and each genesis zkey's byte size (where the upload bound
 * starts); the validated setup adds chain_0 and the SHA-256 of the exact `ceremony.json` bytes,
 * the transcript's anchor.
 */
import type { CircuitName } from "../../config";
import type { CeremonyAnnouncement } from "../announcement";
import type { InitRecord } from "../init";

export interface SetupInput {
  announcement: string;
  init: string;
  genesisSizes: Partial<Record<CircuitName, number>>;
}

export interface Setup {
  announcement: CeremonyAnnouncement;
  init: InitRecord;
  genesisSizes: Partial<Record<CircuitName, number>>;
  chainGenesis: string;
  announcementSha256: string;
}
