/**
 * Operator routes: an RS256 Access token of this team and audience, refetching keys on rotation at
 * most every 30 s, the operator header, and an identity on the list.
 */
import { toBase64url, utf8 } from "@orbinum-ceremony/core";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { verifyAccess } from "../../src/services";
import { appWith, json, refusal } from "../support";

const AUD = "access-audience-tag";
let team = 0;
const nextTeam = () => `https://team-${++team}.cloudflareaccess.com`;

type Pair = CryptoKeyPair;
const rsa = async (): Promise<Pair> =>
  (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as Pair;

let k1: Pair;
let k2: Pair;
const b64 = (v: unknown) => toBase64url(utf8(JSON.stringify(v)));

async function token(
  claims: Record<string, unknown>,
  opts: { key?: Pair; header?: Record<string, unknown> } = {},
): Promise<string> {
  const head = b64({ alg: "RS256", kid: "k1", ...opts.header });
  const body = b64(claims);
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    (opts.key ?? k1).privateKey,
    utf8(`${head}.${body}`),
  );
  return `${head}.${body}.${toBase64url(new Uint8Array(sig))}`;
}
const NOW = Date.now();
const secs = () => Math.floor(NOW / 1000);
const good = (iss: string) => ({ aud: [AUD], iss, exp: secs() + 60, email: "ops@orbinum.io" });

const jwk = async (p: Pair, kid: string) => ({
  ...(await crypto.subtle.exportKey("jwk", p.publicKey)),
  kid,
});

const configure = (patch: Partial<Env>, headers: Record<string, string>) =>
  appWith({ ENVIRONMENT: "production", ...patch }, "https://ceremony.example/admin/state", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ action: "pause" }),
  });

let keysOf: (team: string, call: number) => Promise<Response>;
const calls = new Map<string, number>();

beforeAll(async () => {
  [k1, k2] = await Promise.all([rsa(), rsa()]);
  const j1 = await jwk(k1, "k1");
  keysOf = async () => Response.json({ keys: [j1] });
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    const t = url.replace("/cdn-cgi/access/certs", "");
    calls.set(t, (calls.get(t) ?? 0) + 1);
    if (url.endsWith("/cdn-cgi/access/certs")) return keysOf(t, calls.get(t) ?? 0);
    return new Response(null, { status: 404 });
  });
});

describe("Access tokens (verifyAccess)", () => {
  it("returns the identity of a token of this team and audience", async () => {
    const t = nextTeam();
    keysOf = async () =>
      Response.json({
        keys: [{ ...(await crypto.subtle.exportKey("jwk", k1.publicKey)), kid: "k1" }],
      });
    expect(await verifyAccess(await token(good(t)), t, AUD, NOW)).toBe("ops@orbinum.io");
    expect(await verifyAccess(await token({ ...good(t), aud: AUD }), t, AUD, NOW)).toBe(
      "ops@orbinum.io",
    );
    const service = {
      ...good(t),
      email: undefined,
      common_name: "0123456789abcdef0123456789abcdef.access",
    };
    expect(await verifyAccess(await token(service), t, AUD, NOW)).toBe(
      "0123456789abcdef0123456789abcdef.access",
    );
  });

  it("refuses every token that is not exactly that", async () => {
    const t = nextTeam();
    keysOf = async () =>
      Response.json({
        keys: [{ ...(await crypto.subtle.exportKey("jwk", k1.publicKey)), kid: "k1" }],
      });
    const bad = [
      undefined,
      "not.a.jwt",
      "a.b.c.d",
      await token({ ...good(t), aud: ["another"] }),
      await token({ ...good(t), iss: "https://evil.cloudflareaccess.com" }),
      await token({ ...good(t), exp: secs() - 1 }),
      await token({ ...good(t), exp: String(secs() + 60) }),
      await token({ ...good(t), exp: undefined }),
      await token({ ...good(t), nbf: secs() + 60 }),
      await token(good(t), { key: k2 }),
      await token(good(t), { header: { alg: "HS256" } }),
      await token(good(t), { header: { alg: "none" } }),
      await token({ ...good(t), email: undefined }),
    ];
    for (const b of bad) {
      expect(await verifyAccess(b, t, AUD, NOW)).toBeNull();
    }
    expect(await verifyAccess(await token({ ...good(t), nbf: secs() - 60 }), t, AUD, NOW)).toBe(
      "ops@orbinum.io",
    );
  });

  it("refetches the keys once for an unknown key id (rotation), at most every 30 s", async () => {
    const t = nextTeam();
    const j1 = { ...(await crypto.subtle.exportKey("jwk", k1.publicKey)), kid: "k1" };
    const j2 = { ...(await crypto.subtle.exportKey("jwk", k2.publicKey)), kid: "k2" };
    keysOf = async (_, call) => Response.json({ keys: call === 1 ? [j1] : [j1, j2] });
    expect(await verifyAccess(await token(good(t)), t, AUD, NOW)).toBe("ops@orbinum.io");
    const rotated = await token(good(t), { key: k2, header: { kid: "k2" } });
    expect(await verifyAccess(rotated, t, AUD, NOW + 1000)).toBeNull();
    expect(calls.get(t)).toBe(1);
    expect(await verifyAccess(rotated, t, AUD, NOW + 31_000)).toBe("ops@orbinum.io");
    expect(calls.get(t)).toBe(2);
  });

  it("refuses while the keys cannot be fetched, and does not ask again at once", async () => {
    const t = nextTeam();
    keysOf = async () => new Response("down", { status: 500 });
    expect(await verifyAccess(await token(good(t)), t, AUD, NOW)).toBeNull();
    expect(await verifyAccess(await token(good(t)), t, AUD, NOW + 1000)).toBeNull();
    expect(calls.get(t)).toBe(1);
  });
});

describe("operator routes outside a local run", () => {
  it("needs the operator header, an Access token, and an identity on the list", async () => {
    const t = nextTeam();
    keysOf = async () =>
      Response.json({
        keys: [{ ...(await crypto.subtle.exportKey("jwk", k1.publicKey)), kid: "k1" }],
      });
    const jwt = await token({ ...good(t), exp: Math.floor(Date.now() / 1000) + 60 });
    const env = {
      ACCESS_TEAM_DOMAIN: t,
      ACCESS_AUD: AUD,
      ACCESS_OPERATORS: "ops@orbinum.io, other@x.io",
    };
    const op = { "x-ceremony-operator": "1" };
    const access = { "cf-access-jwt-assertion": jwt };
    expect(await refusal(await configure(env, access))).toEqual([403, "forbidden"]);
    expect(await refusal(await configure(env, op))).toEqual([403, "forbidden"]);
    const r = await configure(
      { ...env, ACCESS_OPERATORS: "someone@else.io" },
      { ...op, ...access },
    );
    expect([r.status, (await json(r)).error.code]).toEqual([403, "forbidden"]);
    const noAudience = await configure({ ...env, ACCESS_AUD: "" }, { ...op, ...access });
    expect(await refusal(noAudience)).toEqual([403, "forbidden"]);
    expect(await refusal(await configure(env, { ...op, ...access }))).toEqual([
      503,
      "not-configured",
    ]);
  });

  it("never treats a deployment as local, even with ENVIRONMENT=local on a public host", async () => {
    const r = await appWith({ ENVIRONMENT: "local" }, "https://ceremony.example/admin/state", {
      method: "POST",
      headers: { "content-type": "application/json", "x-ceremony-operator": "1" },
      body: JSON.stringify({ action: "pause" }),
    });
    expect(await refusal(r)).toEqual([403, "forbidden"]);
  });
});
