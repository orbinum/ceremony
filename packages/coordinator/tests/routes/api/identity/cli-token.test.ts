/**
 * A contributor's CLI token: minted only in the browser for a linked identity, never longer than its
 * session; accepted only on the routes a CLI drives (its place in line, the slot, heads, uploads as
 * `cli`, results), refused everywhere else, and never stretched by a cookie.
 */
import { runDurableObjectAlarm } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { CONTRIBUTOR_PATHS, SESSION_RULES, signToken } from "@orbinum-ceremony/core";
import { beforeEach, describe, expect, it } from "vitest";
import { issueCliToken } from "../../../../src/actions";
import {
  appWith,
  call,
  claimOf,
  clearBuckets,
  freshId,
  GENESIS_SHA256,
  json,
  linkDirect,
  refusal,
  routedTo,
  sessionCookie,
  setQueue,
  setupInput,
  stubOf,
  UNLIMITED,
} from "../../../support";

const ALICE = 901;
const BOB = 902;
const BYTES = new TextEncoder().encode("a contribution uploaded with a CLI token");

let name = "";
beforeEach(async () => {
  await clearBuckets();
  name = freshId("cli-token");
  const stub = stubOf(name);
  await stub.configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
  await runDurableObjectAlarm(stub);
  await linkDirect(stub, ALICE);
});

const cliToken = (
  gid: number,
  opts: { scope?: string; key?: string; ttlMs?: number; login?: string } = {},
) =>
  signToken(
    opts.scope ?? `cli:${env.CEREMONY_ID}`,
    { gid, login: opts.login ?? `user-${gid}` },
    opts.key ?? env.SESSION_KEY,
    opts.ttlMs ?? 60_000,
    Date.now(),
  );

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

const mint = (cookie = sessionCookie(ALICE), headers: Record<string, string> = {}) =>
  call("POST", CONTRIBUTOR_PATHS.cliToken, undefined, { ceremony: name, cookie, headers });

describe("minting a CLI token", () => {
  it("issues one to a signed-in, linked identity, never past its session", async () => {
    const before = Date.now();
    const r = await mint(sessionCookie(ALICE, "user-901", { ttlMs: 45 * 60_000 }));
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const { token, expiresAt } = await json(r);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[0-9a-f]{64}$/);
    expect(expiresAt).toBeLessThanOrEqual(before + 45 * 60_000 + 1000);
    const me = await call("GET", CONTRIBUTOR_PATHS.me, undefined, {
      ceremony: name,
      headers: bearer(token),
    });
    expect(me.status).toBe(200);
  });

  it("caps the lifetime at the CLI's, even for a fresh session", async () => {
    const before = Date.now();
    const r = await mint(sessionCookie(ALICE, "user-901", { ttlMs: SESSION_RULES.ttlMs }));
    const { expiresAt } = await json(r);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + SESSION_RULES.cliTokenTtlMs);
    expect(expiresAt).toBeGreaterThanOrEqual(before + SESSION_RULES.cliTokenTtlMs);
  });

  it("refuses without a session, for an unlinked identity, and once the ceremony is sealed", async () => {
    expect(
      await refusal(await call("POST", CONTRIBUTOR_PATHS.cliToken, undefined, { ceremony: name })),
    ).toEqual([401, "unauthenticated"]);
    expect(await refusal(await mint(sessionCookie(BOB)))).toEqual([403, "not-linked"]);
    await setQueue(stubOf(name), (s) => {
      s.phase = "FINALIZED";
    });
    expect(await refusal(await mint())).toEqual([409, "finalized"]);
  });

  it("refuses a session too close to its end, and a banned or held identity", async () => {
    const short = await mint(sessionCookie(ALICE, "user-901", { ttlMs: 10 * 60_000 }));
    expect(await refusal(short)).toEqual([401, "unauthenticated"]);
    for (const [flag, code] of [
      ["banned", 403],
      ["held", 403],
    ] as const) {
      await setQueue(stubOf(name), (s) => {
        s.identities[String(ALICE)] = {
          noShows: 0,
          cooldownUntil: 0,
          rejected: 0,
          banned: flag === "banned",
          infraResults: 0,
          held: flag === "held",
          accepted: [],
        };
      });
      expect(await refusal(await mint())).toEqual([code, flag]);
    }
  });

  it("never hands out a token for a session that lapsed meanwhile", async () => {
    const r = await issueCliToken({ ...env, ...routedTo(name) } as Env, {
      githubId: ALICE,
      login: "user-901",
      until: Date.now() - 1,
    });
    expect(r).toMatchObject({ ok: false, code: "unauthenticated" });
  });

  it("refuses a CLI token minting another, and a cross-site request", async () => {
    const r = await call("POST", CONTRIBUTOR_PATHS.cliToken, undefined, {
      ceremony: name,
      headers: bearer(cliToken(ALICE)),
    });
    expect(await refusal(r)).toEqual([403, "forbidden"]);
    expect(
      await refusal(await mint(sessionCookie(ALICE), { origin: "https://evil.example" })),
    ).toEqual([403, "forbidden"]);
  });
});

describe("using a CLI token", () => {
  it("drives the slot: place in line, claim, heartbeat, head, finish", async () => {
    await stubOf(name).apply({ type: "join", githubId: ALICE });
    const as = { ceremony: name, headers: bearer(cliToken(ALICE)) };
    const me = await json(await call("GET", CONTRIBUTOR_PATHS.me, undefined, as));
    expect(me.slot).toMatchObject({ claimed: false });
    for (const path of [CONTRIBUTOR_PATHS.claim, CONTRIBUTOR_PATHS.heartbeat]) {
      expect((await call("POST", path, undefined, as)).status).toBe(200);
    }
    const head = await json(await call("GET", CONTRIBUTOR_PATHS.head("shield"), undefined, as));
    expect(head).toMatchObject({ index: 0, output_sha256: GENESIS_SHA256.shield });
    expect((await call("POST", CONTRIBUTOR_PATHS.finish, undefined, as)).status).toBe(200);
  });

  it("leaves the queue with the token", async () => {
    await linkDirect(stubOf(name), BOB);
    await stubOf(name).apply({ type: "join", githubId: ALICE });
    await stubOf(name).apply({ type: "join", githubId: BOB });
    const as = { ceremony: name, headers: bearer(cliToken(BOB)) };
    expect((await json(await call("GET", CONTRIBUTOR_PATHS.me, undefined, as))).position).toBe(1);
    expect((await call("POST", CONTRIBUTOR_PATHS.leave, undefined, as)).status).toBe(200);
    expect(
      (await json(await call("GET", CONTRIBUTOR_PATHS.me, undefined, as))).position,
    ).toBeNull();
  });

  it("is refused where the browser must act: joining, linking, attesting", async () => {
    const as = { ceremony: name, headers: bearer(cliToken(ALICE)) };
    for (const path of ["/api/queue/join", "/api/link/nonce", "/api/session/attest"]) {
      const r = await call("POST", path, undefined, { ...as, body: {} });
      expect([path, ...(await refusal(r))]).toEqual([path, 403, "forbidden"]);
    }
    expect(await refusal(await call("GET", "/api/link", undefined, as))).toEqual([
      403,
      "forbidden",
    ]);
  });

  it("refuses every token that is not exactly a valid one of this ceremony", async () => {
    const good = cliToken(ALICE);
    const [body, mac] = good.split(".") as [string, string];
    for (const authorization of [
      "Bearer",
      "Bearer ",
      `bearer ${good}`,
      `Bearer  ${good}`,
      `Bearer ${good},${good}`,
      `Basic ${good}`,
      `Bearer ${body}.${mac.replace(/^./, mac[0] === "0" ? "1" : "0")}`,
      `Bearer ${body}.${mac.toUpperCase()}`,
      `Bearer ${cliToken(ALICE, { ttlMs: -1 })}`,
      `Bearer ${cliToken(ALICE, { scope: `session:${env.CEREMONY_ID}` })}`,
      `Bearer ${cliToken(ALICE, { scope: "cli:another-ceremony" })}`,
      `Bearer ${cliToken(ALICE, { key: "another-key-of-at-least-32-bytes!!" })}`,
      `Bearer ${cliToken(0)}`,
      `Bearer ${cliToken(ALICE, { login: "not a login!" })}`,
    ]) {
      const r = await call("GET", CONTRIBUTOR_PATHS.me, undefined, {
        ceremony: name,
        headers: { authorization },
      });
      expect([authorization.slice(0, 40), ...(await refusal(r))]).toEqual([
        authorization.slice(0, 40),
        401,
        "unauthenticated",
      ]);
    }
  });

  it("never falls back to the cookie or the development header beside a bad token", async () => {
    const r = await call("GET", CONTRIBUTOR_PATHS.me, ALICE, {
      ceremony: name,
      cookie: sessionCookie(ALICE),
      headers: { authorization: "Bearer x.00" },
    });
    expect(await refusal(r)).toEqual([401, "unauthenticated"]);
  });

  it("refuses a session cookie's token sent as a CLI token", async () => {
    const cookie = sessionCookie(ALICE);
    const token = cookie.slice(cookie.indexOf("=") + 1);
    const r = await call("GET", CONTRIBUTOR_PATHS.me, undefined, {
      ceremony: name,
      headers: bearer(token),
    });
    expect(await refusal(r)).toEqual([401, "unauthenticated"]);
  });
});

const put = async (headers: Record<string, string>, method: "cli" | "browser") => {
  await stubOf(name).apply({ type: "join", githubId: ALICE });
  await stubOf(name).apply({ type: "claim", githubId: ALICE });
  return appWith(
    { UPLOAD_LIMIT: UNLIMITED, ...routedTo(name) },
    `http://localhost${CONTRIBUTOR_PATHS.upload("shield")}`,
    {
      method: "PUT",
      headers: {
        "content-length": String(BYTES.length),
        "x-ceremony-claim": JSON.stringify({
          ...claimOf(BYTES, GENESIS_SHA256.shield),
          method,
        }),
        ...headers,
      },
      body: BYTES,
    },
  );
};

describe("uploading with a CLI token", () => {
  it("accepts an upload claimed as cli", async () => {
    const r = await put(bearer(cliToken(ALICE)), "cli");
    expect(r.status).toBe(202);
  });

  it("refuses a method that is not the credential's", async () => {
    expect(await refusal(await put(bearer(cliToken(ALICE)), "browser"))).toEqual([
      400,
      "malformed",
    ]);
  });

  it("accepts the browser's own upload, claimed as browser", async () => {
    expect((await put({ cookie: sessionCookie(ALICE) }, "browser")).status).toBe(202);
  });

  it("refuses a browser session claiming cli", async () => {
    expect(await refusal(await put({ cookie: sessionCookie(ALICE) }, "cli"))).toEqual([
      400,
      "malformed",
    ]);
  });
});
