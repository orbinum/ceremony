/**
 * The verification report: every check, never stopping at the first failure. A skipped security
 * check fails a full verification (core `skippedCheckStatus`), so a third party never reads "all
 * passed" when the bindings that matter were not checked. SPEC §9.
 */
import { skippedCheckStatus } from "@orbinum-ceremony/core";
import { errorMessage, redact } from "../io";

/** How one check ended. */
export type CheckStatus = "pass" | "fail" | "skip";

/** One check: a stable id, its status, and a redacted, terminal-safe detail. */
export interface Check {
  id: string;
  status: CheckStatus;
  detail?: string;
}

/** Every check of one verification, in order. */
export class Report {
  readonly checks: Check[] = [];
  /** What was verified (ceremony, network, circuits source), printed with the summary. */
  private subject?: string;

  /** `redactions`: extra paths to hide from details, e.g. the ceremony directory. */
  constructor(
    readonly local: boolean,
    private readonly redactions: readonly (readonly [string, string])[] = [],
  ) {}

  private add(id: string, status: CheckStatus, detail?: string): void {
    this.checks.push({
      id,
      status,
      // One line per check: a detail cannot forge the lines after it.
      ...(detail ? { detail: redact(detail, this.redactions).replace(/\s*[\r\n]+\s*/g, " ") } : {}),
    });
  }

  /** Names what is being verified, for the summary (redacted, terminal-safe). */
  describe(subject: string): void {
    this.subject = redact(subject, this.redactions);
  }

  /** Records a passed check. */
  pass(id: string, detail?: string) {
    this.add(id, "pass", detail);
  }

  /** Records a failed check. */
  fail(id: string, detail: string) {
    this.add(id, "fail", detail);
  }

  /** `security`: the check binds the ceremony to something external; skipping it is not a pass. */
  skip(id: string, detail: string, security = false) {
    if (skippedCheckStatus(security, this.local) === "fail") {
      this.fail(id, `required for a full verification: ${detail}`);
    } else {
      this.add(id, "skip", detail);
    }
  }

  /** Pass when `problems` is empty, fail with them otherwise; returns whether it passed. */
  expect(id: string, problems: readonly string[], detail?: string): boolean {
    if (problems.length === 0) this.pass(id, detail);
    else this.fail(id, problems.join("; "));
    return problems.length === 0;
  }

  /** Runs a check that may throw; a throw is a failure, not a crash. Returns whether it passed. */
  async attempt(id: string, fn: () => Promise<string[] | void>): Promise<boolean> {
    try {
      return this.expect(id, (await fn()) ?? []);
    } catch (error) {
      this.fail(id, errorMessage(error));
      return false;
    }
  }

  /** Whether no check failed. */
  get ok(): boolean {
    return this.checks.every((c) => c.status !== "fail");
  }

  /** The report as text, one line per check and a summary. */
  render(): string {
    const mark = { pass: "✓", fail: "✗", skip: "–" } as const;
    const count = (s: CheckStatus) => this.checks.filter((c) => c.status === s).length;
    return [
      ...(this.local ? ["LOCAL MODE: checks that need external inputs may be skipped.", ""] : []),
      ...this.checks.map((c) => `${mark[c.status]} ${c.id}${c.detail ? `  ${c.detail}` : ""}`),
      "",
      ...(this.subject ? [this.subject] : []),
      `${count("pass")} passed, ${count("fail")} failed, ${count("skip")} skipped`,
    ].join("\n");
  }
}
