/** `verify` as the entry point runs it: prints the report, optionally writes it as JSON, exit 1 unless it passed. */
import { writeJson } from "../../io";
import type { Command } from "../types";
import { VERIFY_USAGE } from "./constants";
import { parseVerifyOptions } from "./parse-verify-options";
import { runVerify } from "./run-verify";

export const verifyCommand: Command = {
  summary: "Independently verify a published ceremony, rooted in the pinned ceremony.json",
  usage: VERIFY_USAGE,
  run: async (argv) => {
    const options = parseVerifyOptions(argv);
    const report = await runVerify(options);
    console.log(report.render());
    if (options.report) await writeJson(options.report, { ok: report.ok, checks: report.checks });
    if (!report.ok) process.exitCode = 1;
  },
};
