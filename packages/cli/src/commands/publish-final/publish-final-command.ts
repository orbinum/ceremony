/** `publish-final` as the entry point runs it. */
import type { Command } from "../types";
import { PUBLISH_FINAL_USAGE } from "./constants";
import { parsePublishFinalOptions } from "./parse-publish-final-options";
import { runPublishFinal } from "./run-publish-final";

export const publishFinalCommand: Command = {
  summary: "Publish final/ and hand the sealed beacon and finals to the coordinator",
  usage: PUBLISH_FINAL_USAGE,
  run: async (argv) => {
    await runPublishFinal(parsePublishFinalOptions(argv));
  },
};
