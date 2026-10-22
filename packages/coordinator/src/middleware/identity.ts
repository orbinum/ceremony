/**
 * Who is calling: the GitHub identity of the session cookie (SPEC §3.2), of a contributor's CLI
 * token where the CLI may act (SPEC §4.4), or a local run's development header.
 */
import { asGithubLogin, DEV_IDENTITY_HEADERS, SESSION_RULES } from "@orbinum-ceremony/core";
import { createMiddleware } from "hono/factory";
import { type AppEnv, isLocal } from "../env";
import { fail } from "../http";
import { cliIdentityOf, sessionOf } from "../session";

/** A local run's development login, a valid GitHub login or `dev-<id>`. */
function devLogin(header: string | undefined, id: number): string {
  try {
    return asGithubLogin(header, "login");
  } catch {
    return `dev-${id}`;
  }
}

/**
 * Requires an identity. With `cli`, a CLI token in `Authorization` is accepted; without it, any
 * `Authorization` header is refused. A token that does not verify is refused outright: the
 * cookie or development header beside it is never used instead.
 */
const identityFrom = (cli: boolean) =>
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

/** The browser's identity (session cookie, or a local run's development header). */
export const identity = identityFrom(false);

/** The browser's identity or a contributor's CLI token: the session routes a CLI drives. */
export const contributor = identityFrom(true);

/**
 * Keeps a route to the browser under a router that takes CLI tokens: joining (Turnstile) and
 * attesting (the wallet) need it.
 */
export const browserOnly = createMiddleware<AppEnv>(async (c, next) =>
  c.get("via") === "cli" ? fail(c, "forbidden", "not with a CLI token: use the browser") : next(),
);
