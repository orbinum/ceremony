// cli/commands: every command, by name.
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

/** Every command, by the name typed on the command line. */
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

export type { Clock, Command } from "./types";
export { type AnnounceOptions, parseAnnounceOptions, runAnnounce } from "./announce";
export {
  type ContributeOptions,
  parseContributeOptions,
  runContribute,
  type SessionSummary,
  TOKEN_ENV,
} from "./contribute";
export {
  type ContributeLocalOptions,
  parseContributeLocalOptions,
  runContributeLocal,
} from "./contribute-local";
export { type DownloadOptions, parseDownloadOptions, runDownload } from "./download";
export { type FinalizeOptions, parseFinalizeOptions, runFinalize } from "./finalize";
export { type InitOptions, obtainPtau, parseInitOptions, runInit } from "./init";
export {
  parsePublishFinalOptions,
  type PublishFinalOptions,
  runPublishFinal,
} from "./publish-final";
export { parsePublishInitOptions, type PublishInitOptions, runPublishInit } from "./publish-init";
export { parseVerifyOptions, runVerify, type VerifyOptions } from "./verify";
