/** `finalize` as the entry point runs it. */
import type { Command } from "../types";
import { FINALIZE_USAGE } from "./constants";
import { parseFinalizeOptions } from "./parse-finalize-options";
import { runFinalize } from "./run-finalize";

export const finalizeCommand: Command = {
  summary: "Seal the announced drand beacon, apply it, verify from r1cs, export the VKs",
  usage: FINALIZE_USAGE,
  run: async (argv) => {
    await runFinalize(parseFinalizeOptions(argv));
  },
};
