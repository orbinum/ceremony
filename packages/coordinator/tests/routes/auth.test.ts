/**
 * Sign-in with GitHub: OAuth state and PKCE bound to a __Host- cookie, admission checked against
 * the frozen setup, every failure without a session, and the whole flow limited per client network.
 */
import { env } from "cloudflare:workers";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { signToken } from "@orbinum-ceremony/core";
import {
  appWith,
  call as request,
  countingLimiter,
  freshId,
  json,
  refusal,
  setupInput,
  stubOf,
} from "../support";

let ceremony = freshId("auth");
const call = (
  method: string,
  path: string,
  githubId?: number,
  init: Parameters<typeof request>[3] = {},
) => request(method, path, githubId, { ceremony, ...init });

const sent: Record<string, unknown>[] = [];
function mockGithub(
  user: Record<string, unknown> | (() => Response),
  token: () => Response = () => Response.json({ access_token: "gho_test", token_type: "bearer" }),
) {
  const real = globalThis.fetch;
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === "https://github.com/login/oauth/access_token") {
      sent.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return token();
    }
    if (url === "https://api.github.com/user") {
      return typeof user === "function" ? user() : Response.json(user);
    }
    return real(input, init);
  });
}

const OCTOCAT = {
  id: 583231,
  login: "octocat",
  created_at: "2011-01-25T18:44:36Z",
  public_repos: 8,
  followers: 3,
  following: 9,
};

async function start() {
  const r = await call("GET", "/auth/github");
  const location = new URL(r.headers.get("location") ?? "");
  const cookie = (r.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  return { r, location, cookie, state: location.searchParams.get("state") ?? "" };
}

const cookieOf = (r: Response, name: string) =>
  r.headers
    .getSetCookie()
    .find((c) => c.startsWith(`${name}=`))
    ?.split(";")[0];

describe("GitHub sign-in before the ceremony is configured", () => {
  afterEach(() => vi.restoreAllMocks());

  it("admits nobody: the admission cutoff comes from the frozen setup", async () => {
    mockGithub(OCTOCAT);
    const { cookie, state } = await start();
    const r = await call("GET", `/auth/github/callback?code=c&state=${state}`, undefined, {
      cookie,
    });
    expect(r.headers.get("location")).toBe("/?auth=error&reason=not-configured");
  });
});

describe("GitHub sign-in", () => {
  beforeAll(async () => {
    ceremony = freshId("auth");
    await stubOf(ceremony).configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
  });
  afterEach(() => vi.restoreAllMocks());

  it("redirects to GitHub with a state bound to a __Host- cookie", async () => {
    const { r, location, state } = await start();
    expect(r.status).toBe(302);
    expect(location.origin + location.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(location.searchParams.get("client_id")).toBe("test-client-id");
    expect(location.searchParams.get("redirect_uri")).toBe("http://localhost/auth/github/callback");
    expect(location.searchParams.get("allow_signup")).toBe("false");
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(state).toMatch(/^[0-9a-f]{32}$/);
    expect(r.headers.get("set-cookie")).toMatch(
      /^__Host-oauth-state=.+Max-Age=600.+Path=\/.+HttpOnly.+Secure.+SameSite=Lax/i,
    );
  });

  it("sends GitHub the secret, the callback and the PKCE verifier of this attempt", async () => {
    mockGithub(OCTOCAT);
    const { cookie, state, location } = await start();
    sent.length = 0;
    await call("GET", `/auth/github/callback?code=c&state=${state}`, undefined, { cookie });
    const [body] = sent;
    expect(body).toMatchObject({
      client_id: "test-client-id",
      client_secret: env.GITHUB_CLIENT_SECRET,
      code: "c",
      redirect_uri: "http://localhost/auth/github/callback",
    });
    const verifier = String(body?.code_verifier);
    const challenge = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    const b64 = btoa(String.fromCharCode(...new Uint8Array(challenge)))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/, "");
    expect(b64).toBe(location.searchParams.get("code_challenge"));
  });

  it("signs in an eligible account: session cookie, then identified routes work", async () => {
    mockGithub(OCTOCAT);
    const { cookie, state } = await start();
    const r = await call("GET", `/auth/github/callback?code=c&state=${state}`, undefined, {
      cookie,
    });
    expect(r.headers.get("location")).toBe("/?auth=ok");
    const session = cookieOf(r, "__Host-ceremony-session");
    expect(session).toBeDefined();
    const set = r.headers.getSetCookie().find((c) => c.startsWith("__Host-ceremony-session="));
    expect(set).toMatch(/Max-Age=43200.+Path=\/.+HttpOnly.+Secure.+SameSite=Lax/i);
    expect(set).not.toMatch(/Domain=/i);
    expect(r.headers.getSetCookie().some((c) => /^__Host-oauth-state=;.*Max-Age=0/i.test(c))).toBe(
      true,
    );
    const linked = await call("GET", "/api/link", undefined, { cookie: session });
    expect(linked.status).toBe(200);
    expect(await json(linked)).toEqual({
      ceremonyId: "local",
      githubId: 583231,
      login: "octocat",
      linked: null,
    });
  });

  it("refuses a callback whose state does not match the cookie (login CSRF)", async () => {
    mockGithub(OCTOCAT);
    const { cookie } = await start();
    const r = await call("GET", `/auth/github/callback?code=c&state=${"0".repeat(32)}`, undefined, {
      cookie,
    });
    expect(r.headers.get("location")).toBe("/?auth=error&reason=state");
    expect(cookieOf(r, "__Host-ceremony-session")).toBeUndefined();
  });

  it("gives no session to an account below the thresholds, and says why", async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().replace(/\.\d{3}Z$/, "Z");
    mockGithub({ ...OCTOCAT, created_at: yesterday, following: 0 });
    const { cookie, state } = await start();
    const r = await call("GET", `/auth/github/callback?code=c&state=${state}`, undefined, {
      cookie,
    });
    expect(r.headers.get("location")).toBe(
      "/?auth=ineligible&reasons=created-after-cutoff,account-too-new,follows-too-few",
    );
    expect(cookieOf(r, "__Host-ceremony-session")).toBeUndefined();
  });

  it("reports a cancelled authorization", async () => {
    const { cookie, state } = await start();
    const r = await call(
      "GET",
      `/auth/github/callback?error=access_denied&state=${state}`,
      undefined,
      {
        cookie,
      },
    );
    expect(r.headers.get("location")).toBe("/?auth=cancelled");
  });

  it("reports GitHub failures without a session", async () => {
    for (const [user, token] of [
      [OCTOCAT, () => new Response("down", { status: 500 })],
      [OCTOCAT, () => Response.json({ error: "bad_verification_code" })],
      [() => new Response("down", { status: 500 }), undefined],
      [{ id: "x", login: "octocat" }, undefined],
    ] as const) {
      vi.restoreAllMocks();
      mockGithub(user, token);
      const { cookie, state } = await start();
      const r = await call("GET", `/auth/github/callback?code=c&state=${state}`, undefined, {
        cookie,
      });
      expect(r.headers.get("location")).toBe("/?auth=error&reason=github");
      expect(cookieOf(r, "__Host-ceremony-session")).toBeUndefined();
    }
  });

  it("refuses a callback without the state cookie, with an expired one, or without a code", async () => {
    mockGithub(OCTOCAT);
    const { cookie, state } = await start();
    const expired = `__Host-oauth-state=${signToken(
      `oauth-state:${env.CEREMONY_ID}`,
      { state, verifier: "v" },
      env.SESSION_KEY,
      60_000,
      Date.now() - 11 * 60_000,
    )}`;
    const asSession = `__Host-oauth-state=${signToken(
      `session:${env.CEREMONY_ID}`,
      { state, verifier: "v" },
      env.SESSION_KEY,
      60_000,
      Date.now(),
    )}`;
    for (const [query, c] of [
      [`code=c&state=${state}`, undefined],
      [`code=c&state=${state}`, expired],
      [`code=c&state=${state}`, asSession],
      [`state=${state}`, cookie],
    ] as const) {
      const r = await call(
        "GET",
        `/auth/github/callback?${query}`,
        undefined,
        c ? { cookie: c } : {},
      );
      expect(r.headers.get("location")).toBe("/?auth=error&reason=state");
    }
  });

  it("signs out: the session cookie is cleared", async () => {
    const r = await call("POST", "/auth/logout");
    expect(await json(r)).toEqual({ ok: true });
    expect(
      r.headers.getSetCookie().some((c) => /^__Host-ceremony-session=;.*Max-Age=0/i.test(c)),
    ).toBe(true);
  });
});

describe("sign-in limits", () => {
  it("bound /auth per client network: a whole IPv6 /64 is one client", async () => {
    const { binding, counts } = countingLimiter(2);
    const from = (ip: string, path = "/auth/github") =>
      request("GET", path, undefined, {
        env: { AUTH_LIMIT: binding },
        headers: { "cf-connecting-ip": ip },
      });
    expect((await from("2001:db8:5::1")).status).toBe(302);
    expect((await from("2001:db8:5::2", "/auth/github/callback?code=c&state=s")).status).toBe(302);
    expect(await refusal(await from("2001:db8:5::3"))).toEqual([429, "rate-limited"]);
    expect((await from("2001:db8:6::1")).status).toBe(302);
    expect(Object.fromEntries(counts)).toEqual({ "2001:db8:5:0::/64": 3, "2001:db8:6:0::/64": 1 });
  });

  it("refuses a sign-in without a client address outside a local run", async () => {
    const r = await appWith({ ENVIRONMENT: "production" }, "https://ceremony.example/auth/github");
    expect(await refusal(r)).toEqual([403, "forbidden"]);
  });
});
