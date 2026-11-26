/**
 * GitHub admission: thresholds, the init.json cutoff, and strict reading of the profile. SPEC §3.2.
 */
import { describe, expect, it } from "vitest";
import {
  admissionCutoff,
  githubIneligibility,
  validateGithubProfile,
} from "../../../src/coordination/admission";
import { FormatError } from "../../../src/primitives/errors";

const DAY = 24 * 60 * 60_000;
const NOW = Date.parse("2026-11-20T00:00:00.000Z");
const ANNOUNCED = Date.parse("2026-11-01T00:00:00.000Z");

/** A `GET /user` answer as GitHub sends it (timestamps without milliseconds, extra fields). */
const user = (patch: Record<string, unknown> = {}) => ({
  id: 583231,
  login: "octocat",
  created_at: "2011-01-25T18:44:36Z",
  public_repos: 8,
  followers: 3,
  following: 9,
  avatar_url: "https://avatars.githubusercontent.com/u/583231",
  ...patch,
});

const check = (patch: Record<string, unknown> = {}) =>
  githubIneligibility(validateGithubProfile(user(patch)), { cutoff: ANNOUNCED, now: NOW });

describe("GitHub admission (SPEC §3.2)", () => {
  it("admits an established account", () => {
    expect(check()).toEqual([]);
  });

  it("refuses an account created at or after the cutoff, and one younger than 30 days", () => {
    expect(check({ created_at: "2026-11-02T00:00:00Z" })).toEqual([
      "created-after-cutoff",
      "account-too-new",
    ]);
    expect(check({ created_at: new Date(NOW - 29 * DAY).toISOString() })).toEqual([
      "account-too-new",
    ]);
    expect(check({ created_at: new Date(ANNOUNCED).toISOString() })).toContain(
      "created-after-cutoff",
    );
    expect(check({ created_at: new Date(ANNOUNCED - 1000).toISOString() })).not.toContain(
      "created-after-cutoff",
    );
    expect(check({ created_at: new Date(NOW - 31 * DAY).toISOString() })).toEqual([]);
    expect(check({ created_at: new Date(ANNOUNCED - 1 * DAY).toISOString() })).toEqual([
      "account-too-new",
    ]);
  });

  it("names every missing threshold", () => {
    expect(check({ public_repos: 0, followers: 0, following: 4 })).toEqual([
      "no-public-repos",
      "follows-too-few",
    ]);
  });

  it("refuses an answer of the wrong shape instead of guessing", () => {
    for (const patch of [
      { id: "583231" },
      { login: "-bad-" },
      { created_at: "yesterday" },
      { following: -1 },
    ]) {
      expect(() => validateGithubProfile(user(patch))).toThrow(FormatError);
    }
  });
});

describe("GitHub admission fails closed", () => {
  it("refuses dates Date would only guess at", () => {
    for (const created_at of ["2011", "Jan 25 2011", "2011-01-25", "2011-01-25T18:44:36+01:00"]) {
      expect(() => validateGithubProfile(user({ created_at }))).toThrow(/github\.created_at/);
    }
  });

  it("returns unknown-age when a date cannot be read", () => {
    const p = validateGithubProfile(user());
    expect(githubIneligibility(p, { cutoff: Number.NaN, now: NOW })).toEqual(["unknown-age"]);
  });

  it("applies the thresholds at their exact boundaries", () => {
    expect(check({ created_at: new Date(NOW - 30 * DAY).toISOString() })).toEqual([]);
    expect(check({ following: 4 })).toEqual(["follows-too-few"]);
    expect(check({ following: 5 })).toEqual([]);
    expect(() => validateGithubProfile(user({ following: 2_000_000_000 }))).toThrow(
      /implausibly large/,
    );
  });
});

describe("admission cutoff", () => {
  it("is when the ceremony's inputs were frozen (init.json created_at), a published value", () => {
    expect(admissionCutoff({ created_at: "2026-01-01T00:00:00.000Z" })).toBe(
      Date.parse("2026-01-01T00:00:00.000Z"),
    );
  });
});
