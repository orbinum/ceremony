/**
 * Validates a coordinator's setup for one ceremony: canonical `ceremony.json` and
 * `genesis/init.json` texts, checked against each other and the pinned config, and a genesis size
 * for every circuit. Throws `FormatError` listing the problems.
 */
import { utf8 } from "../../primitives/encoding";
import { FormatError } from "../../primitives/errors";
import { sha256Hex } from "../../primitives/hashing";
import { parseAnnouncement } from "../announcement";
import { checkInitAgainstAnnouncement, checkInitAgainstConfig, parseInit } from "../init";
import { chainGenesis } from "../transcript";
import type { Setup, SetupInput } from "./types";

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
