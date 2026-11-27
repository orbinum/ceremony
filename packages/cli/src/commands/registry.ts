/** Every command, by the name typed on the command line, in the order `--help` lists them. */
import { announceCommand } from "./announce";
import { contributeCommand } from "./contribute";
import { contributeLocalCommand } from "./contribute-local";
import { downloadCommand } from "./download";
import { finalizeCommand } from "./finalize";
import { initCommand } from "./init";
import { publishFinalCommand } from "./publish-final";
import { publishInitCommand } from "./publish-init";
import type { Command } from "./types";
import { verifyCommand } from "./verify";

export const COMMANDS: Readonly<Record<string, Command>> = {
  init: initCommand,
  announce: announceCommand,
  "publish-init": publishInitCommand,
  contribute: contributeCommand,
  "contribute-local": contributeLocalCommand,
  finalize: finalizeCommand,
  "publish-final": publishFinalCommand,
  download: downloadCommand,
  verify: verifyCommand,
};
