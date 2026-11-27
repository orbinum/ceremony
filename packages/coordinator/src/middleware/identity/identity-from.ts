/**
 * Requires a caller identity: a CLI token in `Authorization` where the CLI may act (`cli`; without
 * it, any `Authorization` header is refused), else the session cookie, else on a local run the
 * development header (a GitHub id, and a valid login or `dev-<id>`). A token that does not verify
 * is refused outright: the cookie or development header beside it is never used instead.
 */
import { asGithubLogin, DEV_IDENTITY_HEADERS, SESSION_RULES } from "@orbinum-ceremony/core";
import { createMiddleware } from "hono/factory";
import { type AppEnv, isLocal } from "../../env";
import { fail } from "../../http";
import { cliIdentityOf, sessionOf } from "../../session";

function devLogin(header: string | undefined, id: number): string {
  try {
    return asGithubLogin(header, "login");
  } catch {
    return `dev-${id}`;
  }
}

export const identityFrom = (cli: boolean) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const authorization = c.req.header("authorization");
    if (authorization !== undefined) {
      if (!cli) return fail(c, "forbidden", "not with a CLI token: use the browser");
      const id = cliIdentityOf(c.env, authorization, Date.now());
      if (!id) return fail(c, "unauthenticated", "invalid or expired CLI token");
      c.set("githubId", id.gid);
      c.set("login", id.login);
      c.set("via", "cli");
      c.set("until", id.exp);
      return next();
    }
    const session = sessionOf(c);
    if (session) {
      c.set("githubId", session.gid);
      c.set("login", session.login);
      c.set("via", "session");
      c.set("until", session.exp);
      return next();
    }
    const dev = c.req.header(DEV_IDENTITY_HEADERS.id);
    if (isLocal(c.env, c.req.url) && dev && /^[1-9][0-9]{0,15}$/.test(dev)) {
      const id = Number(dev);
      if (Number.isSafeInteger(id)) {
        c.set("githubId", id);
        c.set("login", devLogin(c.req.header(DEV_IDENTITY_HEADERS.login), id));
        c.set("via", "dev");
        c.set("until", Date.now() + SESSION_RULES.ttlMs);
        return next();
      }
    }
    return fail(c, "unauthenticated", "sign in first");
  });
