/**
 * The identity a verified session token carries, read back strictly; throws `FormatError` if it is
 * not a GitHub identity.
 */
import { asGithubLogin } from "../../ceremony";
import { asObject, asPositiveInt } from "../../primitives/schema";

interface SessionClaims {
  gid: number;
  login: string;
}

export function validateSessionClaims(payload: unknown): SessionClaims {
  const o = asObject(payload, "session");
  return {
    gid: asPositiveInt(o.gid, "session.gid"),
    login: asGithubLogin(o.login, "session.login"),
  };
}
