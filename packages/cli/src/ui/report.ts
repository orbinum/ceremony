/**
 * The verification report: every check in order, never stopping at the first failure, a throw
 * counting as a failed check. A skipped security check (one that binds the ceremony to something
 * external) fails a full verification (core `skippedCheckStatus`), so a third party never reads
 * "all passed" when the bindings that matter were not checked. Details are redacted (`redactions`
 * adds paths such as the ceremony directory) and folded onto one line, so a detail cannot forge the
 * lines after it; `describe` names what was verified for the summary.
 */
import { skippedCheckStatus } from "@orbinum-ceremony/core";
import { errorMessage, redact } from "../io";
import type { Check, CheckStatus } from "./types";

export class Report {
  readonly checks: Check[] = [];
  private subject?: string;

  constructor(
    readonly local: boolean,
    private readonly redactions: readonly (readonly [string, string])[] = [],
  ) {}

  private add(id: string, status: CheckStatus, detail?: string): void {
    this.checks.push({
      id,
      status,
      ...(detail ? { detail: redact(detail, this.redactions).replace(/\s*[\r\n]+\s*/g, " ") } : {}),
    });
  }

  describe(subject: string): void {
    this.subject = redact(subject, this.redactions);
  }

  pass(id: string, detail?: string) {
    this.add(id, "pass", detail);
  }

  fail(id: string, detail: string) {
    this.add(id, "fail", detail);
  }

  skip(id: string, detail: string, security = false) {
    if (skippedCheckStatus(security, this.local) === "fail") {
      this.fail(id, `required for a full verification: ${detail}`);
    } else {
      this.add(id, "skip", detail);
    }
  }

  expect(id: string, problems: readonly string[], detail?: string): boolean {
    if (problems.length === 0) this.pass(id, detail);
    else this.fail(id, problems.join("; "));
    return problems.length === 0;
  }

  async attempt(id: string, fn: () => Promise<string[] | void>): Promise<boolean> {
    try {
      return this.expect(id, (await fn()) ?? []);
    } catch (error) {
      this.fail(id, errorMessage(error));
      return false;
    }
  }

  get ok(): boolean {
    return this.checks.every((c) => c.status !== "fail");
  }

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
