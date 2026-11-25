/**
 * Sign-in (SPEC §3.2): every way a callback ends, as core's wire outcome; only an eligible
 * account comes back with a profile to sign in.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:workers";
import { completeSignIn } from "../../src/actions";
import { freshId, routedTo, setupInput, stubOf } from "../support";

/** GitHub answering the token exchange, then `/user` with `user()`. */
const github = (user: () => Response) =>
  vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input) =>
      String(input).includes("access_token") ? Response.json({ access_token: "t" }) : user(),
    );

describe("completeSignIn", () => {
  afterEach(() => vi.restoreAllMocks());
  const ORIGIN = "http://localhost";
  const expected = { state: "s".repeat(32), verifier: "v".repeat(64) };
  const OCTOCAT = {
    id: 583231,
    login: "octocat",
    created_at: "2011-01-25T18:44:36Z",
    public_repos: 8,
    followers: 3,
    following: 9,
  };

  it("names every way a sign-in ends, as the client reads it", async () => {
    const name = freshId("signin");
    const e = { ...env, ...routedTo(name) } as Env;
    const q = { code: "c", state: expected.state };
    expect(await completeSignIn(e, ORIGIN, { error: "access_denied" }, expected)).toEqual({
      outcome: { auth: "cancelled" },
    });
    expect(await completeSignIn(e, ORIGIN, q, null)).toEqual({
      outcome: { auth: "error", reason: "state" },
    });
    expect(await completeSignIn(e, ORIGIN, { ...q, state: "x".repeat(32) }, expected)).toEqual({
      outcome: { auth: "error", reason: "state" },
    });
    expect(await completeSignIn(e, ORIGIN, q, expected)).toEqual({
      outcome: { auth: "error", reason: "not-configured" },
    });
    await stubOf(name).configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
    // Each attempt is a new state: a state completes once.
    let n = 0;
    const attempt = () => {
      n += 1;
      const state = `${n}`.padStart(32, "s");
      return [
        { code: "c", state },
        { ...expected, state },
      ] as const;
    };
    github(() => new Response("down", { status: 500 }));
    expect(await completeSignIn(e, ORIGIN, ...attempt())).toEqual({
      outcome: { auth: "error", reason: "github" },
    });
    vi.restoreAllMocks();
    github(() => Response.json({ ...OCTOCAT, followers: 0 }));
    expect(await completeSignIn(e, ORIGIN, ...attempt())).toEqual({
      outcome: { auth: "ineligible", reasons: ["too-few-followers"] },
    });
    vi.restoreAllMocks();
    github(() => Response.json(OCTOCAT));
    const ok = attempt();
    expect(await completeSignIn(e, ORIGIN, ...ok)).toMatchObject({
      outcome: { auth: "ok" },
      profile: { id: 583231, login: "octocat" },
    });
    // The same state again (a copied cookie): refused before GitHub is asked.
    expect(await completeSignIn(e, ORIGIN, ...ok)).toEqual({
      outcome: { auth: "error", reason: "state" },
    });
  });

  it("admits only invited accounts to a closed ceremony, and invited ones past the thresholds", async () => {
    const name = freshId("signin");
    const e = { ...env, ...routedTo(name) } as Env;
    const admission = { mode: "closed", invited: [42] } as const;
    await stubOf(name).configure(
      setupInput(Date.now() - 1000, Date.now() + 86_400_000, { admission }),
    );
    let n = 0;
    const attempt = () => {
      n += 1;
      const state = `${n}`.padStart(32, "s");
      return [
        { code: "c", state },
        { ...expected, state },
      ] as const;
    };
    github(() => Response.json(OCTOCAT));
    expect(await completeSignIn(e, ORIGIN, ...attempt())).toEqual({
      outcome: { auth: "ineligible", reasons: ["not-invited"] },
    });
    vi.restoreAllMocks();
    github(() =>
      Response.json({
        ...OCTOCAT,
        id: 42,
        followers: 0,
        created_at: new Date().toISOString().slice(0, 19) + "Z",
      }),
    );
    expect(await completeSignIn(e, ORIGIN, ...attempt())).toMatchObject({
      outcome: { auth: "ok" },
      profile: { id: 42 },
    });
  });
});
