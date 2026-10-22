/**
 * In CI every real-input suite must run: a missing input fails here, so a suite skipped for lack
 * of it is never green by absence.
 */
import { describe, expect, it } from "vitest";

describe.runIf(process.env.CI)("CI test inputs", () => {
  it.each([
    "ORBINUM_PTAU",
    "ORBINUM_REHEARSAL_DIR",
    "ORBINUM_VK_PACKER",
    "ORBINUM_CIRCUITS_REPO",
    "ORBINUM_RUST_VERIFIER",
  ])("%s is set", (name) => {
    expect(process.env[name], `${name} is missing in CI`).toBeTruthy();
  });
});
