/**
 * The CLI command shown for copy-paste never holds the token: it reads it at a silent prompt, in
 * one line, so neither shell history nor a multi-line paste ever carries it.
 */
import { describe, expect, it } from "vitest";
import { cliCommand } from "../../../../src/pages/home/steps";

describe("cliCommand", () => {
  const command = cliCommand("https://ceremony.example");

  it("reads the token silently and exports it before contributing", () => {
    expect(command).toMatch(
      /^read -rs ORBINUM_CEREMONY_TOKEN && export ORBINUM_CEREMONY_TOKEN && orbinum-ceremony contribute /,
    );
    expect(command).toContain("--coordinator https://ceremony.example");
  });

  it("never assigns the token inline, and fits on one line", () => {
    expect(command).not.toContain("ORBINUM_CEREMONY_TOKEN=");
    expect(command).not.toContain("\n");
  });
});
