import { QUEUE_RULES } from "@orbinum-ceremony/core";
import { describe, expect, it } from "vitest";
import { ApiError, signInOutcomeOf } from "../../../src/api";
import { errorText, signInText } from "../../../src/pages/home/text";

describe("errorText", () => {
  it("says what a contributor can do about a refusal, with the queue's own numbers", () => {
    const text = errorText(new ApiError(429, "cooldown", "cooldown"));
    expect(text).toContain(`${QUEUE_RULES.cooldownMs / 60_000} minutes`);
  });

  it("falls back to the coordinator's message and code", () => {
    expect(errorText(new ApiError(409, "busy", "a verification is in flight"))).toBe(
      "a verification is in flight (busy)",
    );
  });
});

describe("signInText", () => {
  it("says nothing on success and lists every ineligibility reason", () => {
    expect(signInText({ auth: "ok" })).toBeNull();
    expect(
      signInText({ auth: "ineligible", reasons: ["account-too-new", "no-public-repos"] }),
    ).toMatch(/30 days old; the account has no public repositories/);
  });

  it("never shows reason text a link carries, only the reasons it knows", () => {
    const linked = signInOutcomeOf(
      "?auth=ineligible&reasons=Send+your+seed+to+evil.example,constructor",
    );
    expect(signInText(linked as NonNullable<typeof linked>)).toBe(
      "This GitHub account cannot join.",
    );
  });
});
