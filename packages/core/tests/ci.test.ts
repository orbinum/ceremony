/**
 * In CI every real-input suite must run: a missing input fails here, so a suite skipped for lack
 * of it is never green by absence.
 */
import { describe, expect, it } from "vitest";

describe.runIf(process.env.CI)("CI test inputs", () => {
  it.each(["ORBINUM_REHEARSAL_DIR"])("%s is set", (name) => {
    expect(process.env[name], `${name} is missing in CI`).toBeTruthy();
  });
});
