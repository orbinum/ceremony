/**
 * Re-checks a published ceremony from private copies of its artifacts, rooted only in the SHA-256
 * of ceremony.json obtained from an official channel, and returns the report. It never throws: a
 * crash is a failed check.
 */
import { createStage, errorMessage } from "../../io";
import { Report } from "../../ui";
import { checkFinal, checkInputs, reportTranscript } from "./checks";
import { loadContext } from "./context";
import type { VerifyOptions } from "./types";

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
