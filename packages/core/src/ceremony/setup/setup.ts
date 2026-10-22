/**
 * The frozen setup a coordinator is configured with: the published `ceremony.json` and
 * `genesis/init.json` texts, canonical, checked against each other and the pinned config, and
 * covering every circuit outside a local ceremony. SPEC §6.1–6.2.
 */
import type { CircuitName } from "../../config";
import { utf8 } from "../../primitives/encoding";
import { FormatError } from "../../primitives/errors";
import { canonicalJson, sha256Hex } from "../../primitives/hashing";
import { type CeremonyAnnouncement, parseAnnouncement } from "../announcement";
import {
  checkInitAgainstAnnouncement,
  checkInitAgainstConfig,
  checkInitCoverage,
  type InitRecord,
  parseInit,
} from "../init";
import { chainGenesis } from "../transcript";

/** The published files as text: their exact bytes are what the announcement pins. */
export interface SetupInput {
  announcement: string;
  init: string;
  /** Byte size of each genesis zkey (the upload bound starts there). */
  genesisSizes: Partial<Record<CircuitName, number>>;
}

/** A validated setup. */
export interface Setup {
  announcement: CeremonyAnnouncement;
  init: InitRecord;
  genesisSizes: Partial<Record<CircuitName, number>>;
  /** chain_0, rooted in the announcement. */
  chainGenesis: string;
  /** SHA-256 of the exact `ceremony.json` bytes: the transcript's anchor. */
  announcementSha256: string;
}

/** Validates a setup for `ceremonyId`; throws `FormatError` naming the first problem. */
export function parseSetup(input: SetupInput, ceremonyId: string): Setup {
  if (typeof input?.announcement !== "string" || typeof input.init !== "string") {
    throw new FormatError("setup: announcement and init must be the published texts");
  }
  const announcement = parseAnnouncement(input.announcement);
  const init = parseInit(input.init);
  const problems = [
    ...(announcement.ceremony_id === ceremonyId ? [] : [`not ceremony ${ceremonyId}`]),
    ...checkInitAgainstAnnouncement(announcement, init, sha256Hex(utf8(input.init))),
    ...checkInitAgainstConfig(init),
    ...(announcement.network === "local" ? [] : checkInitCoverage(init)),
  ];
  const genesisSizes: Setup["genesisSizes"] = {};
  for (const { name } of init.circuits) {
    const size = input.genesisSizes?.[name];
    if (!Number.isSafeInteger(size) || (size ?? 0) <= 0)
      problems.push(`no genesis size for ${name}`);
    else genesisSizes[name] = size;
  }
  if (problems.length > 0) throw new FormatError(`setup: ${problems.join("; ")}`);
  return {
    announcement,
    init,
    genesisSizes,
    chainGenesis: chainGenesis(ceremonyId, announcement),
    announcementSha256: sha256Hex(utf8(input.announcement)),
  };
}

/** A circuit's pinned genesis in this setup, if the ceremony has the circuit. */
export const genesisOf = (setup: Setup, circuit: CircuitName) =>
  setup.init.circuits.find((c) => c.name === circuit) ?? null;

/** Two setups are the same ceremony: configuring again with the same one is a no-op. */
export const sameSetup = (a: Setup, b: Setup): boolean => canonicalJson(a) === canonicalJson(b);

/** The contribution window the announcement fixed, in epoch ms. */
export const scheduleOf = (setup: Setup) => ({
  openAt: Date.parse(setup.announcement.schedule.open),
  closeAt: Date.parse(setup.announcement.schedule.close),
});
