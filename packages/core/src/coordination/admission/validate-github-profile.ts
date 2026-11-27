/**
 * GitHub's `GET /user` answer, as far as admission reads it: an unexpected shape is refused rather
 * than guessed at. The creation time must be GitHub's UTC form and a real date, not one `Date`
 * would roll over (Feb 30) or refuse (month 13).
 */
import { asGithubLogin } from "../../ceremony";
import { FormatError } from "../../primitives/errors";
import { asCount, asIsoTime, asObject, asPositiveInt } from "../../primitives/schema";
import type { GithubProfile } from "./types";

const GITHUB_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const MAX_COUNT = 1_000_000_000;

const count = (v: unknown, p: string) => {
  const n = asCount(v, p);
  if (n > MAX_COUNT) throw new FormatError(`${p}: implausibly large`);
  return n;
};

export function validateGithubProfile(v: unknown): GithubProfile {
  const o = asObject(v, "github");
  if (typeof o.created_at !== "string" || !GITHUB_TIME.test(o.created_at)) {
    throw new FormatError("github.created_at: expected an ISO UTC timestamp");
  }
  const created = new Date(o.created_at);
  if (
    Number.isNaN(created.getTime()) ||
    created.toISOString().slice(0, 19) !== o.created_at.slice(0, 19)
  ) {
    throw new FormatError("github.created_at: not a real date");
  }
  return {
    id: asPositiveInt(o.id, "github.id"),
    login: asGithubLogin(o.login, "github.login"),
    created_at: asIsoTime(created.toISOString(), "github.created_at"),
    public_repos: count(o.public_repos, "github.public_repos"),
    following: count(o.following, "github.following"),
  };
}
