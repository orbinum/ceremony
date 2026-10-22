/**
 * Attacks on the GitHub sign-in (SPEC §3.2): foreign, tampered and replayed OAuth state, open
 * redirects, and GitHub answers of the wrong shape, not JSON, or very large.
 */
import { env } from "cloudflare:workers";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { signToken } from "@orbinum-ceremony/core";
import { appWith, call as request, freshId, routedTo, setupInput, stubOf } from "../support";

let ceremony = freshId("auth-attacks");
const call = (method: string, path: string, init: Parameters<typeof request>[3] = {}) =>
  request(method, path, undefined, { ceremony, ...init });

const OCTOCAT = {
  id: 583231,
  login: "octocat",
  created_at: "2011-01-25T18:44:36Z",
  public_repos: 1,
  followers: 1,
  following: 5,
};

/** Every token request GitHub receives. */
const exchanges: Record<string, unknown>[] = [];
function mockGithub(user: unknown | (() => Response)) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === "https://github.com/login/oauth/access_token") {
      exchanges.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return Response.json({ access_token: "gho_test", token_type: "bearer" });
    }
    if (url === "https://api.github.com/user") {
      return typeof user === "function" ? (user as () => Response)() : Response.json(user);
    }
    // Nothing else may be reached from a test.
    throw new Error(`unexpected fetch ${url}`);
  });
}

async function start(init: Parameters<typeof request>[3] = {}) {
  const r = await call("GET", "/auth/github", init);
  const location = new URL(r.headers.get("location") ?? "");
  const cookie = (r.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  return { cookie, state: location.searchParams.get("state") ?? "" };
}
const back = (query: string, cookie?: string) =>
  call("GET", `/auth/github/callback?${query}`, cookie ? { cookie } : {});
const sessionSet = (r: Response) =>
  r.headers.getSetCookie().some((c) => /^__Host-ceremony-session=[^;]+/.test(c));
const stateCookie = (payload: Record<string, unknown>, scope = `oauth-state:${env.CEREMONY_ID}`) =>
  `__Host-oauth-state=${signToken(scope, payload, env.SESSION_KEY, 600_000, Date.now())}`;

beforeAll(async () => {
  ceremony = freshId("auth-attacks");
  await stubOf(ceremony).configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
});
afterEach(() => vi.restoreAllMocks());

describe("OAuth state", () => {
  it("refuses a state from another attempt, another ceremony, or the state cookie of a session", async () => {
    mockGithub(OCTOCAT);
    const a = await start();
    const b = await start();
    const cases: [string, string][] = [
      // b's state, a's cookie.
      [`code=c&state=${b.state}`, a.cookie],
      // A state cookie signed for another ceremony.
      [
        `code=c&state=${a.state}`,
        stateCookie({ state: a.state, verifier: "v" }, "oauth-state:other"),
      ],
      // A session token presented as the state cookie.
      [
        `code=c&state=${a.state}`,
        stateCookie({ state: a.state, verifier: "v" }, `session:${env.CEREMONY_ID}`),
      ],
      // Missing / empty state.
      ["code=c", a.cookie],
      ["code=c&state=", a.cookie],
      // A state that differs only in case or length.
      [`code=c&state=${a.state.toUpperCase()}`, a.cookie],
      [`code=c&state=${a.state}0`, a.cookie],
      // Cookie payload fields of the wrong type.
      [`code=c&state=1`, stateCookie({ state: 1, verifier: "v" })],
      [`code=c&state=${a.state}`, stateCookie({ state: a.state, verifier: 5 })],
    ];
    for (const [query, cookie] of cases) {
      // oxlint-disable-next-line no-await-in-loop -- one case at a time
      const r = await back(query, cookie);
      expect([r.headers.get("location"), sessionSet(r)]).toEqual([
        "/?auth=error&reason=state",
        false,
      ]);
    }
    expect(exchanges).toHaveLength(0);
  });

  it("refuses a state cookie whose payload was edited (PKCE verifier swapped) without the key", async () => {
    mockGithub(OCTOCAT);
    const { cookie, state } = await start();
    const [name, token] = cookie.split("=") as [string, string];
    const [body, mac] = token.split(".") as [string, string];
    const payload = JSON.parse(atob(body.replaceAll("-", "+").replaceAll("_", "/"))) as Record<
      string,
      unknown
    >;
    const forgedBody = btoa(JSON.stringify({ ...payload, verifier: "attacker-chosen" }))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/, "");
    const r = await back(`code=c&state=${state}`, `${name}=${forgedBody}.${mac}`);
    expect(r.headers.get("location")).toBe("/?auth=error&reason=state");
    expect(exchanges).toHaveLength(0);
  });

  it("sends GitHub only the verifier bound in the signed cookie, never one from the query", async () => {
    mockGithub(OCTOCAT);
    const { cookie, state } = await start();
    exchanges.length = 0;
    await back(`code=c&state=${state}&code_verifier=evil&verifier=evil`, cookie);
    expect(exchanges).toHaveLength(1);
    expect(exchanges[0]?.code_verifier).not.toBe("evil");
    expect(String(exchanges[0]?.code_verifier)).toMatch(/^[0-9a-f]{64}$/);
  });

  // Accepted limit (KL-44 in docs/KNOWN_LIMITS.md): GitHub's single-use code and PKCE stop the replay.
  it("lets a state cookie be replayed within its 10 min lifetime, reaching GitHub with the same verifier", async () => {
    mockGithub(OCTOCAT);
    const { cookie, state } = await start();
    exchanges.length = 0;
    const first = await back(`code=c1&state=${state}`, cookie);
    expect(first.headers.get("location")).toBe("/?auth=ok");
    const replay = await back(`code=c2&state=${state}`, cookie);
    expect(replay.headers.get("location")).toBe("/?auth=ok");
    expect(exchanges.map((e) => e.code)).toEqual(["c1", "c2"]);
    expect(exchanges[0]?.code_verifier).toBe(exchanges[1]?.code_verifier);
    exchanges.length = 0;
  });

  it("takes the first of duplicated query parameters and still requires the cookie's state", async () => {
    mockGithub(OCTOCAT);
    const { cookie, state } = await start();
    const r = await back(`code=c&state=${"0".repeat(32)}&state=${state}`, cookie);
    expect(r.headers.get("location")).toBe("/?auth=error&reason=state");
    exchanges.length = 0;
  });

  it("clears the state cookie on an `error` callback without checking the state, and signs nobody in", async () => {
    const { cookie } = await start();
    const r = await back("error=access_denied", cookie);
    expect(r.headers.get("location")).toBe("/?auth=cancelled");
    expect(r.headers.getSetCookie().some((c) => /^__Host-oauth-state=;.*Max-Age=0/i.test(c))).toBe(
      true,
    );
    expect(sessionSet(r)).toBe(false);
  });
});

describe("no open redirect", () => {
  it("always redirects to this origin's root, whatever the callback carries", async () => {
    mockGithub(OCTOCAT);
    for (const extra of [
      "redirect_uri=https://evil.example",
      "next=//evil.example",
      "return_to=https%3A%2F%2Fevil.example",
      "state=%0d%0aLocation:%20https://evil.example",
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one case at a time
      const { cookie, state } = await start();
      // oxlint-disable-next-line no-await-in-loop -- one case at a time
      const r = await back(`code=c&state=${state}&${extra}`, cookie);
      expect(r.headers.get("location")).toMatch(/^\/\?auth=[a-z]+(&reason=[a-z-]+)?$/);
    }
    exchanges.length = 0;
  });

  it("starts the flow with a redirect_uri on the request's own origin and a fixed path", async () => {
    const r = await call("GET", "/auth/github?redirect_uri=https://evil.example/x&next=//evil");
    const location = new URL(r.headers.get("location") ?? "");
    expect(location.origin).toBe("https://github.com");
    expect(location.searchParams.get("redirect_uri")).toBe("http://localhost/auth/github/callback");
  });
});

describe("GitHub answers of the wrong shape never sign anyone in", () => {
  const cases: [string, unknown][] = [
    ["id 0", { ...OCTOCAT, id: 0 }],
    ["id negative", { ...OCTOCAT, id: -1 }],
    ["id float", { ...OCTOCAT, id: 1.5 }],
    ["id string", { ...OCTOCAT, id: "583231" }],
    ["id above 2^53", { ...OCTOCAT, id: 2 ** 53 }],
    ["missing created_at", { ...OCTOCAT, created_at: undefined }],
    ["created_at with offset", { ...OCTOCAT, created_at: "2011-01-25T18:44:36+00:00" }],
    ["counts as strings", { ...OCTOCAT, followers: "100" }],
    ["counts huge", { ...OCTOCAT, following: 1e21 }],
    ["counts negative", { ...OCTOCAT, public_repos: -5 }],
    ["missing counts", { id: 1, login: "a", created_at: OCTOCAT.created_at }],
    ["array", [OCTOCAT]],
    ["null", null],
  ];
  for (const [what, user] of cases) {
    it(`refuses ${what}`, async () => {
      mockGithub(user);
      const { cookie, state } = await start();
      const r = await back(`code=c&state=${state}`, cookie);
      expect([r.headers.get("location"), sessionSet(r)]).toEqual([
        "/?auth=error&reason=github",
        false,
      ]);
      exchanges.length = 0;
    });
  }

  it("refuses an answer that is not JSON", async () => {
    mockGithub(() => new Response("<html>rate limited</html>", { status: 200 }));
    const { cookie, state } = await start();
    const r = await back(`code=c&state=${state}`, cookie);
    expect(r.headers.get("location")).toBe("/?auth=error&reason=github");
    exchanges.length = 0;
  });

  // GitHub is the only source of this answer, so its size is not bounded.
  it("reads a very large /user answer in full", async () => {
    mockGithub({ ...OCTOCAT, bio: "x".repeat(8 * 1024 * 1024) });
    const { cookie, state } = await start();
    const r = await back(`code=c&state=${state}`, cookie);
    expect(r.headers.get("location")).toBe("/?auth=ok");
    exchanges.length = 0;
  });

  it("refuses an account created exactly at the admission cutoff", async () => {
    // The fixture's init.json created_at, the admission cutoff, is 2026-01-01T00:00:00.000Z.
    mockGithub({ ...OCTOCAT, created_at: "2026-01-01T00:00:00Z" });
    const { cookie, state } = await start();
    const r = await back(`code=c&state=${state}`, cookie);
    expect(r.headers.get("location")).toBe("/?auth=ineligible&reasons=created-after-cutoff");
    exchanges.length = 0;
  });
});

describe("the sign-in under another host", () => {
  it("builds redirect_uri from the request host (Cloudflare only routes the zone's own host)", async () => {
    const r = await appWith(
      { ENVIRONMENT: "production", ...routedTo(ceremony) },
      "https://ceremony.example/auth/github",
      { headers: { "cf-connecting-ip": "10.9.9.9" }, redirect: "manual" },
    );
    expect(new URL(r.headers.get("location") ?? "").searchParams.get("redirect_uri")).toBe(
      "https://ceremony.example/auth/github/callback",
    );
  });
});
