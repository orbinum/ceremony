/**
 * `verify`: re-checks a published ceremony from private copies of its artifacts, rooted only in
 * the SHA-256 of ceremony.json obtained from an official channel (SPEC §6.2, §9).
 */
import { createStage, errorMessage, writeJson } from "../../io";
import { Report } from "../../ui";
import type { Command } from "../types";
import { checkFinal, checkInputs, reportTranscript } from "./checks";
import { loadContext } from "./context";
import { parseVerifyOptions, VERIFY_USAGE, type VerifyOptions } from "./options";

/** Runs every check and returns the report (never throws: a crash is a failed check). */
export async function runVerify(options: VerifyOptions): Promise<Report> {
  const report = new Report(options.local, [[options.dir, "<dir>"]]);
  const stage = await createStage("orbinum-verify-", options.dir);
  try {
    const ctx = await loadContext(options, report, stage);
    if (!ctx) return report;

    await checkInputs(ctx);
    const beacon = reportTranscript(ctx);
    if (!beacon) {
      report.fail("final keys", "no valid sealed beacon, cannot check the final keys");
    } else {
      for (const c of ctx.init.value.circuits) {
        await checkFinal(ctx, beacon, c);
      }
    }
  } catch (error) {
    report.fail("verification", errorMessage(error));
  } finally {
    await stage.cleanup();
  }
  return report;
}

/** `verify` as the entry point runs it: prints the report, exit 1 unless it passed. */
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
