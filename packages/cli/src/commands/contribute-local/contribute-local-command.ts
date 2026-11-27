/** `contribute-local` as the entry point runs it. */
import type { Command } from "../types";
import { CONTRIBUTE_LOCAL_USAGE } from "./constants";
import { parseContributeLocalOptions } from "./parse-contribute-local-options";
import { runContributeLocal } from "./run-contribute-local";

export const contributeLocalCommand: Command = {
  summary: "Simulate contributors on a rehearsal ceremony, verifying every upload",
  usage: CONTRIBUTE_LOCAL_USAGE,
  run: async (argv) => {
    await runContributeLocal(parseContributeLocalOptions(argv));
  },
};
