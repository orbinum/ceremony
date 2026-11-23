/**
 * Attacks Cloudflare Access in front of `/admin` (COORDINATOR §3): algorithm confusion, odd key
 * ids, claim boundaries, operator-list matching, the operator header, path variants, key refetches.
 */
import { toBase64url, utf8 } from "@orbinum-ceremony/core";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { verifyAccess } from "../../src/services";
import { appWith, freshId, refusal, routedTo } from "../support";

const AUD = "attacks-audience";
let teams = 0;
const nextTeam = () => `https://attacks-${++teams}.cloudflareaccess.com`;

let k1: CryptoKeyPair;
let j1: JsonWebKey & { kid: string };
const b64 = (v: unknown) => toBase64url(utf8(JSON.stringify(v)));
async function token(claims: Record<string, unknown>, header: Record<string, unknown> = {}) {
  const head = b64({ alg: "RS256", kid: "k1", ...header });
  const body = b64(claims);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", k1.privateKey, utf8(`${head}.${body}`));
  return `${head}.${body}.${toBase64url(new Uint8Array(sig))}`;
}
const NOW = Date.now();
const secs = Math.floor(NOW / 1000);
const good = (iss: string, patch: Record<string, unknown> = {}) => ({
  aud: [AUD],
  iss,
  exp: secs + 60,
  email: "ops@orbinum.io",
  ...patch,
});

/** Key fetches per team, and an optional delay so concurrent requests overlap. */
const fetches = new Map<string, number>();
let delayMs = 0;

beforeAll(async () => {
  k1 = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  j1 = { ...((await crypto.subtle.exportKey("jwk", k1.publicKey)) as JsonWebKey), kid: "k1" };
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.endsWith("/cdn-cgi/access/certs")) throw new Error(`unexpected fetch ${url}`);
    const team = url.replace("/cdn-cgi/access/certs", "");
    fetches.set(team, (fetches.get(team) ?? 0) + 1);
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    return Response.json({ keys: [j1] });
  });
});

/** A pause request to `/admin` outside a local run. */
const admin = async (patch: Partial<Env>, headers: Record<string, string>, path = "/admin/state") =>
  appWith(
    { ENVIRONMENT: "production", ...routedTo(freshId("operator-attacks")), ...patch },
    `https://ceremony.example${path}`,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ action: "pause" }),
    },
  );

describe("Access token verification", () => {
  it("refuses algorithm confusion and odd headers", async () => {
    const t = nextTeam();
    // HS256 MAC'd with the public key's modulus as secret (classic confusion).
    const hsHead = b64({ alg: "HS256", kid: "k1" });
    const hsBody = b64(good(t));
    const hsKey = await crypto.subtle.importKey(
      "raw",
      utf8(JSON.stringify(j1)),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const hsSig = await crypto.subtle.sign("HMAC", hsKey, utf8(`${hsHead}.${hsBody}`));
    const confused = `${hsHead}.${hsBody}.${toBase64url(new Uint8Array(hsSig))}`;
    const unsigned = `${b64({ alg: "none" })}.${b64(good(t))}.`;
    const cases = [
      confused,
      unsigned,
      `${b64({ alg: "none" })}.${b64(good(t))}.x`,
      await token(good(t), { alg: "rs256" }),
      await token(good(t), { alg: "RS512" }),
      await token(good(t), { alg: "PS256" }),
      await token(good(t), { alg: ["RS256"] }),
      await token(good(t), { kid: { $ne: null } }),
      await token(good(t), { kid: ["k1"] }),
      await token(good(t), { jwk: j1, kid: "attacker" }),
      await token(good(t), { jku: "https://evil.example/keys", kid: "attacker" }),
    ];
    for (const c of cases) {
      // oxlint-disable-next-line no-await-in-loop -- one token at a time
      expect(await verifyAccess(c, t, AUD, NOW)).toBeNull();
    }
  });

  it("refuses re-encoded segments and surrounding whitespace", async () => {
    const t = nextTeam();
    const ok = await token(good(t));
    expect(await verifyAccess(ok, t, AUD, NOW)).toBe("ops@orbinum.io");
    const [h, p, s] = ok.split(".") as [string, string, string];
    for (const c of [
      `${h}=.${p}.${s}`,
      `${h}.${p}=.${s}`,
      ` ${ok}`,
      `${ok}\n`,
      `${h}.${p}.${s}.`,
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one token at a time
      expect(await verifyAccess(c, t, AUD, NOW)).toBeNull();
    }
  });

  it("holds exp and nbf at their boundaries, and aud/iss exactly", async () => {
    const t = nextTeam();
    const v = async (patch: Record<string, unknown>) =>
      verifyAccess(await token(good(t, patch)), t, AUD, NOW);
    expect(await v({ exp: NOW / 1000 })).toBeNull();
    expect(await v({ exp: NOW / 1000 + 0.5 })).toBe("ops@orbinum.io");
    expect(await v({ nbf: NOW / 1000 })).toBe("ops@orbinum.io");
    expect(await v({ nbf: NOW / 1000 + 0.5 })).toBeNull();
    expect(await v({ iss: `${t}/` })).toBeNull();
    expect(await v({ iss: t.toUpperCase() })).toBeNull();
    expect(await v({ aud: [[AUD]] })).toBeNull();
    expect(await v({ aud: `${AUD} ` })).toBeNull();
    expect(await v({ aud: [] })).toBeNull();
    expect(await v({ aud: undefined })).toBeNull();
  });

  it("ignores an nbf that is not a number (only Access can sign one)", async () => {
    const t = nextTeam();
    expect(
      await verifyAccess(await token(good(t, { nbf: String(secs + 3600) })), t, AUD, NOW),
    ).toBe("ops@orbinum.io");
  });

  it('does not fall back to common_name when email is an empty string (a service token with email "" is refused)', async () => {
    const t = nextTeam();
    const v = async (patch: Record<string, unknown>) =>
      verifyAccess(await token(good(t, patch)), t, AUD, NOW);
    expect(
      await v({ email: "", common_name: "0123456789abcdef0123456789abcdef.access" }),
    ).toBeNull();
    expect(await v({ email: null, common_name: "0123456789abcdef0123456789abcdef.access" })).toBe(
      "0123456789abcdef0123456789abcdef.access",
    );
    expect(
      await v({ email: 5, common_name: "0123456789abcdef0123456789abcdef.access" }),
    ).toBeNull();
  });

  it("takes common_name only as a service token's Client ID, never as another identity's name", async () => {
    const t = nextTeam();
    const v = async (patch: Record<string, unknown>) =>
      verifyAccess(await token(good(t, patch)), t, AUD, NOW);
    // …nor can an IdP-asserted email spell a service token's Client ID.
    expect(await v({ email: "0123456789abcdef0123456789abcdef.access" })).toBeNull();
    // e.g. a certificate whose subject spells an allowlisted operator's email
    for (const cn of [
      "ops@orbinum.io",
      "svc.access",
      "0123456789ABCDEF0123456789ABCDEF.ACCESS",
      "0123456789abcdef0123456789abcdef.accessx",
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one token at a time
      expect([cn, await v({ email: undefined, common_name: cn })]).toEqual([cn, null]);
    }
  });

  it("refetches keys for unknown key ids at most every 30 s when requests arrive one by one", async () => {
    const t = nextTeam();
    expect(await verifyAccess(await token(good(t)), t, AUD, NOW)).toBe("ops@orbinum.io");
    for (let i = 0; i < 20; i++) {
      // oxlint-disable-next-line no-await-in-loop -- sequential on purpose
      await verifyAccess(await token(good(t), { kid: `nope-${i}` }), t, AUD, NOW + 31_000 + i);
    }
    expect(fetches.get(t)).toBe(2);
  });

  it("coalesces concurrent key refetches triggered by unknown key ids into one", async () => {
    const t = nextTeam();
    expect(await verifyAccess(await token(good(t)), t, AUD, NOW)).toBe("ops@orbinum.io");
    const forged = await token(good(t), { kid: "unknown" });
    delayMs = 20;
    try {
      await Promise.all(
        Array.from({ length: 25 }, () => verifyAccess(forged, t, AUD, NOW + 31_000)),
      );
    } finally {
      delayMs = 0;
    }
    expect(fetches.get(t)).toBeLessThanOrEqual(2);
  });

  // A cold isolate has no keys cached yet.
  it("coalesces concurrent first fetches on a cold cache into one", async () => {
    const t = nextTeam();
    const forged = await token(good(t), { kid: "unknown" });
    delayMs = 20;
    try {
      await Promise.all(Array.from({ length: 25 }, () => verifyAccess(forged, t, AUD, NOW)));
    } finally {
      delayMs = 0;
    }
    expect(fetches.get(t)).toBeLessThanOrEqual(1);
  });
});

describe("the operator gate", () => {
  it("matches ACCESS_OPERATORS exactly (case- and whitespace-sensitive identity, trimmed list)", async () => {
    const t = nextTeam();
    const cfg = { ACCESS_TEAM_DOMAIN: t, ACCESS_AUD: AUD };
    const as = async (email: string, ACCESS_OPERATORS: string) =>
      (
        await refusal(
          await admin(
            { ...cfg, ACCESS_OPERATORS },
            {
              "x-ceremony-operator": "1",
              "cf-access-jwt-assertion": await token(good(t, { email })),
            },
          ),
        )
      )[1];
    expect(await as("ops@orbinum.io", " ops@orbinum.io , other@x.io ")).not.toBe("forbidden");
    expect(await as("OPS@orbinum.io", "ops@orbinum.io")).toBe("forbidden");
    expect(await as("ops@orbinum.io ", "ops@orbinum.io")).toBe("forbidden");
    expect(await as("ops@orbinum.io", "*")).toBe("forbidden");
    expect(await as("ops@orbinum.io", ",")).toBe("forbidden");
    expect(await as("ops@orbinum.io", "")).toBe("forbidden");
    expect(await as("ops@orbinum.io", "ops@orbinum.io.evil")).toBe("forbidden");
    expect(await as("a@x.io,ops@orbinum.io", "ops@orbinum.io")).toBe("forbidden");
  });

  it("requires X-Ceremony-Operator exactly `1`, even with a valid token", async () => {
    const t = nextTeam();
    const jwt = await token(good(t));
    const cfg = { ACCESS_TEAM_DOMAIN: t, ACCESS_AUD: AUD, ACCESS_OPERATORS: "ops@orbinum.io" };
    const cases: Record<string, string>[] = [
      {},
      { "x-ceremony-operator": "true" },
      { "x-ceremony-operator": "01" },
    ];
    for (const h of cases) {
      // oxlint-disable-next-line no-await-in-loop -- one case at a time
      const r = await admin(cfg, { ...h, "cf-access-jwt-assertion": jwt });
      // oxlint-disable-next-line no-await-in-loop -- one case at a time
      expect(await refusal(r)).toEqual([403, "forbidden"]);
    }
  });

  it("refuses everything when the Access application is not configured", async () => {
    const t = nextTeam();
    const jwt = await token(good(t));
    for (const cfg of [
      { ACCESS_TEAM_DOMAIN: "", ACCESS_AUD: AUD },
      { ACCESS_TEAM_DOMAIN: t, ACCESS_AUD: "" },
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one case at a time
      const r = await admin(
        { ...cfg, ACCESS_OPERATORS: "ops@orbinum.io" },
        { "x-ceremony-operator": "1", "cf-access-jwt-assertion": jwt },
      );
      // oxlint-disable-next-line no-await-in-loop -- one case at a time
      expect(await refusal(r)).toEqual([403, "forbidden"]);
    }
  });

  it("guards percent-encoded and re-cased /admin paths the same way (or does not route them)", async () => {
    for (const path of ["/%61dmin/state", "/admin/%73tate", "/ADMIN/state", "/admin//state"]) {
      // oxlint-disable-next-line no-await-in-loop -- one path at a time
      const [status] = await refusal(await admin({}, { "x-ceremony-operator": "1" }, path));
      expect([path, status === 403 || status === 404]).toEqual([path, true]);
    }
  });
});
