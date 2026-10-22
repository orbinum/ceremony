/**
 * Attacks GitHub admission with hostile or odd `GET /user` answers: threshold boundaries, wrong
 * types, missing fields, huge numbers and ids that are not positive integers.
 */
import { describe, expect, it } from "vitest";
import { githubIneligibility, validateGithubProfile } from "../../../src/coordination/admission";

const DAY = 24 * 60 * 60_000;
const NOW = Date.parse("2026-11-20T00:00:00.000Z");
const CUTOFF = Date.parse("2026-11-01T00:00:00.000Z");

const user = (patch: Record<string, unknown> = {}) => ({
  id: 583231,
  login: "octocat",
  created_at: "2011-01-25T18:44:36Z",
  public_repos: 1,
  followers: 1,
  following: 5,
  ...patch,
});
const iso = (t: number) => new Date(t).toISOString().replace(".000Z", "Z");
const check = (patch: Record<string, unknown> = {}) =>
  githubIneligibility(validateGithubProfile(user(patch)), { cutoff: CUTOFF, now: NOW });

describe("admission thresholds at their exact boundaries", () => {
  it("admits the exact minimums and refuses one below each", () => {
    expect(check()).toEqual([]);
    expect(check({ public_repos: 0 })).toEqual(["no-public-repos"]);
    expect(check({ followers: 0 })).toEqual(["too-few-followers"]);
    expect(check({ following: 4 })).toEqual(["follows-too-few"]);
  });

  it("refuses an account created exactly at the cutoff, admits one second before", () => {
    const at = new Date(CUTOFF).toISOString().replace(".000Z", "Z");
    expect(check({ created_at: at })).toContain("created-after-cutoff");
    const before = new Date(CUTOFF - 1000).toISOString().replace(".000Z", "Z");
    expect(check({ created_at: before })).not.toContain("created-after-cutoff");
  });

  it("treats exactly 30 days of age as old enough, 30 days minus 1 s as too new", () => {
    // Independent of the cutoff: a cutoff far in the future.
    const at = (created: number) =>
      githubIneligibility(validateGithubProfile(user({ created_at: iso(created) })), {
        cutoff: NOW + DAY,
        now: NOW,
      });
    expect(at(NOW - 30 * DAY)).toEqual([]);
    expect(at(NOW - 30 * DAY + 1000)).toEqual(["account-too-new"]);
  });

  it("fails closed when the cutoff or the clock cannot be read", () => {
    const p = validateGithubProfile(user());
    expect(githubIneligibility(p, { cutoff: Number.NaN, now: NOW })).toEqual(["unknown-age"]);
    expect(githubIneligibility(p, { cutoff: CUTOFF, now: Number.POSITIVE_INFINITY })).toEqual([
      "unknown-age",
    ]);
  });
});

describe("a profile of the wrong shape is refused, never coerced", () => {
  it("refuses ids that are not positive safe integers", () => {
    for (const id of [0, -1, 1.5, "583231", 2 ** 53, Number.POSITIVE_INFINITY, null, true, [1]]) {
      expect(() => validateGithubProfile(user({ id }))).toThrow(/github\.id: expected an integer/);
    }
    expect(() => validateGithubProfile(user({ id: undefined }))).toThrow(
      /github\.id: expected an integer/,
    );
    expect(validateGithubProfile(user({ id: Number.MAX_SAFE_INTEGER })).id).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it("refuses counts of the wrong type, negative, fractional or implausibly large", () => {
    for (const field of ["public_repos", "followers", "following"]) {
      for (const v of [
        "8",
        -1,
        1.5,
        1_000_000_001,
        Number.POSITIVE_INFINITY,
        null,
        undefined,
        {},
        [5],
        true,
      ]) {
        expect(() => validateGithubProfile(user({ [field]: v }))).toThrow(
          new RegExp(`github\\.${field}: (expected an integer|implausibly large)`),
        );
      }
      expect(validateGithubProfile(user({ [field]: 1_000_000_000 }))[field as "followers"]).toBe(
        1_000_000_000,
      );
    }
  });

  it("refuses created_at outside GitHub's exact UTC form", () => {
    for (const created_at of [
      "2011-01-25T18:44:36z",
      "2011-01-25T18:44:36.1Z",
      "2011-01-25T18:44:36.123456Z",
      "2011-01-25 18:44:36Z",
      " 2011-01-25T18:44:36Z",
      "2011-01-25T18:44:36Z\n",
      "+002011-01-25T18:44:36Z",
      1_296_000_000_000,
      null,
    ]) {
      expect(() => validateGithubProfile(user({ created_at }))).toThrow(
        /github\.created_at: expected an ISO UTC timestamp/,
      );
    }
  });

  it("refuses an impossible calendar date in GitHub's form", () => {
    // Today `Date` raises the RangeError; a FormatError naming the field is also accepted.
    for (const created_at of ["2011-13-25T18:44:36Z", "2011-01-25T25:44:36Z"]) {
      expect(() => validateGithubProfile(user({ created_at }))).toThrow(
        /github\.created_at|Invalid time value/,
      );
    }
  });

  it("refuses logins GitHub cannot have", () => {
    for (const login of ["", "-a", "a-", "a".repeat(40), "a b", "a_b", "ä", 5, null]) {
      expect(() => validateGithubProfile(user({ login }))).toThrow(/github\.login: /);
    }
  });

  it("refuses an answer that is not an object", () => {
    for (const v of [null, [], "octocat", 5, undefined]) {
      expect(() => validateGithubProfile(v)).toThrow(/github: expected an object/);
    }
  });

  it("ignores fields admission does not read (no prototype or extra-field influence)", () => {
    const parsed = validateGithubProfile(
      JSON.parse(
        `{"id":1,"login":"a","created_at":"2011-01-25T18:44:36Z","public_repos":1,"followers":1,"following":5,"__proto__":{"followers":0},"site_admin":true}`,
      ),
    );
    expect(Object.keys(parsed).toSorted()).toEqual([
      "created_at",
      "followers",
      "following",
      "id",
      "login",
      "public_repos",
    ]);
  });
});
