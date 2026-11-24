import { QUEUE_RULES, ss58Address, toBase58 } from "@orbinum-ceremony/core";
import { describe, expect, it } from "vitest";
import { ApiError, signInOutcomeOf } from "../../../src/api";
import {
  accountLine,
  errorText,
  NOT_ANNOUNCED,
  signInText,
  solanaFormOf,
} from "../../../src/pages/home/text";

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
  it("says the ceremony is not announced yet rather than a failure", () => {
    expect(signInText({ auth: "error", reason: "not-configured" })).toBe(NOT_ANNOUNCED);
    expect(signInText({ auth: "error", reason: "github" })).toMatch(/failed/);
  });

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

describe("a linked account as the page shows it", () => {
  const key = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
  const ss58 = ss58Address(key);

  it("adds the Solana form of an ed25519 account: the same key, base58", () => {
    expect(solanaFormOf("ed25519", ss58)).toBe(toBase58(key));
    expect(accountLine("ed25519", ss58)).toContain(`Solana ${toBase58(key).slice(0, 8)}`);
  });

  it("adds nothing to any other account, or to one it cannot read", () => {
    expect(solanaFormOf("sr25519", ss58)).toBeNull();
    expect(solanaFormOf("ed25519", "not-an-account")).toBeNull();
    expect(accountLine("eip712", "0x1234567890abcdef1234567890abcdef12345678")).not.toContain(
      "Solana",
    );
  });
});
