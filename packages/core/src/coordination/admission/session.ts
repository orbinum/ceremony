/** The identity a session cookie carries, read back strictly. SPEC §3.2. */
import { asGithubLogin } from "../../ceremony";
import { asObject, asPositiveInt } from "../../primitives/schema";

/** Who a session belongs to. */
interface SessionClaims {
  gid: number;
  login: string;
}

/**
 * The claims of a verified session token; throws `FormatError` if they are not a GitHub identity.
 */
export function validateSessionClaims(payload: unknown): SessionClaims {
  const o = asObject(payload, "session");
  return {
    gid: asPositiveInt(o.gid, "session.gid"),
    login: asGithubLogin(o.login, "session.login"),
  };
}
