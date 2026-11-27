/**
 * `contribute` as the entry point runs it: Ctrl-C (or SIGTERM) ends the session cleanly or leaves
 * the queue, a second one exits at once; then the hashes to sign the attestation with are printed.
 */
import type { Command } from "../types";
import { CONTRIBUTE_USAGE } from "./constants";
import { parseContributeOptions } from "./parse-contribute-options";
import { runContribute } from "./run-contribute";

export const contributeCommand: Command = {
  summary: "Contribute to the ceremony from this machine (the CLI path)",
  usage: CONTRIBUTE_USAGE,
  run: async (argv) => {
    const options = parseContributeOptions(argv);
    const abort = new AbortController();
    const stop = () => {
      if (abort.signal.aborted) process.exit(130);
      console.error("interrupted: ending the session or leaving the queue (again to quit at once)");
      abort.abort();
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    try {
      const summary = await runContribute(options, console.log, abort.signal);
      console.log(`\nsession ${summary.seq}: sign the attestation in the browser`);
      for (const c of summary.contributions) {
        console.log(`  ${c.circuit} #${c.index}  h_k ${c.contributionHash}`);
      }
      if (summary.earlier > 0) {
        console.log(`  and ${summary.earlier} accepted before this run (see the receipt)`);
      }
    } finally {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
    }
  },
};
