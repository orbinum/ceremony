/** `init` as the entry point runs it. */
import type { Command } from "../types";
import { INIT_USAGE } from "./constants";
import { parseInitOptions } from "./parse-init-options";
import { runInit } from "./run-init";

export const initCommand: Command = {
  summary: "Pin the ptau, compile the circuits from a release tag and create the genesis zkeys",
  usage: INIT_USAGE,
  run: async (argv) => {
    await runInit(parseInitOptions(argv));
  },
};
