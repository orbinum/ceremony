/** `announce` as the entry point runs it. */
import type { Command } from "../types";
import { ANNOUNCE_USAGE } from "./constants";
import { parseAnnounceOptions } from "./parse-announce-options";
import { runAnnounce } from "./run-announce";

export const announceCommand: Command = {
  summary: "Write ceremony.json (the root of trust) and print the SHA-256 to publish",
  usage: ANNOUNCE_USAGE,
  run: async (argv) => {
    await runAnnounce(parseAnnounceOptions(argv));
  },
};
