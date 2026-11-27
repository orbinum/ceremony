/** `publish-init` as the entry point runs it. */
import type { Command } from "../types";
import { PUBLISH_INIT_USAGE } from "./constants";
import { parsePublishInitOptions } from "./parse-publish-init-options";
import { runPublishInit } from "./run-publish-init";

export const publishInitCommand: Command = {
  summary: "Publish the frozen setup to the coordinator's public bucket and configure it",
  usage: PUBLISH_INIT_USAGE,
  run: async (argv) => {
    await runPublishInit(parsePublishInitOptions(argv));
  },
};
