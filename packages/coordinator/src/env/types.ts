/**
 * The Hono context of every route: the bindings and, once authenticated, the GitHub identity,
 * what vouched for it (the session cookie, a contributor's CLI token, a local run's development
 * header) and until when that credential holds. `Env` also gains the optional secrets outside
 * `wrangler.jsonc`'s required list: the Access service token of the application in front of the
 * verifier's Tunnel, set both or neither.
 */
declare global {
  interface Env {
    VERIFIER_ACCESS_CLIENT_ID?: string;
    VERIFIER_ACCESS_CLIENT_SECRET?: string;
  }
}

export interface AppEnv {
  Bindings: Env;
  Variables: { githubId: number; login: string; via: "session" | "cli" | "dev"; until: number };
}
