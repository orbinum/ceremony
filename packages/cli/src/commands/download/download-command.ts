/** `download` as the entry point runs it. */
import type { Command } from "../types";
import { DOWNLOAD_USAGE } from "./constants";
import { parseDownloadOptions } from "./parse-download-options";
import { runDownload } from "./run-download";

export const downloadCommand: Command = {
  summary: "Mirror a published ceremony, every file checked against its pin",
  usage: DOWNLOAD_USAGE,
  run: async (argv) => {
    await runDownload(parseDownloadOptions(argv));
  },
};
