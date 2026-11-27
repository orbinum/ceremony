/** The expensive checks run only on input whose cheap checks passed: the circuit's and the ptau's. */
import { describe, expect, it } from "vitest";
import {
  attemptGated,
  type Failed,
  markFailed,
  PTAU_PREREQUISITE,
} from "../../../../src/commands/verify/gate";
import { Report } from "../../../../src/ui";

describe("gated checks", () => {
  it("runs a check whose prerequisites passed, and reports one that would run on bad input", async () => {
    const report = new Report(true);
    const failed: Failed = new Map();
    let ran = 0;
    const check = async () => void (ran += 1);
    expect(await attemptGated(report, failed, "shield", "shield: expensive", check)).toBe(true);
    markFailed(failed, "shield", "shield: cheap");
    expect(await attemptGated(report, failed, "shield", "shield: expensive 2", check)).toBe(false);
    expect(ran).toBe(1);
    expect(report.checks.at(-1)).toEqual({
      id: "shield: expensive 2",
      status: "fail",
      detail: "not run: prerequisite failed (shield: cheap)",
    });
  });

  it("blocks every circuit on a failed ptau, and a circuit named ptau shadows nothing", async () => {
    const report = new Report(true);
    const failed: Failed = new Map();
    markFailed(failed, "ptau", "ptau: cheap");
    expect(await attemptGated(report, failed, "shield", "shield: run", async () => {})).toBe(true);
    markFailed(failed, PTAU_PREREQUISITE, "ptau is a regular file");
    expect(await attemptGated(report, failed, "shield", "shield: blocked", async () => {})).toBe(
      false,
    );
  });
});
