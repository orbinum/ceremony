/**
 * Attacks the session cookie outside a local run (SPEC §3.2, KL-37): mangled tokens, the wrong
 * cookie name or prefix, duplicated cookies, and correctly signed tokens of the wrong shape.
 */
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { hmacSha256Hex, keyBytes, signToken, toBase64url, utf8 } from "@orbinum-ceremony/core";
import { appWith, refusal, sessionCookie } from "../support";

const HOST = "https://ceremony.example";
const NAME = "__Host-ceremony-session";
const linkAs = (cookie: string) =>
  appWith({ ENVIRONMENT: "production" }, `${HOST}/api/link`, { headers: { cookie } });
const tokenOf = (cookie: string) => cookie.slice(cookie.indexOf("=") + 1);
/** A token over an exact body text, signed with this deployment's key (the key holder only). */
const signedBody = (body: string, scope = `session:${env.CEREMONY_ID}`) =>
  `${body}.${hmacSha256Hex(keyBytes(env.SESSION_KEY, "k"), `${scope}.${body}`)}`;
const b64 = (v: unknown) => toBase64url(utf8(typeof v === "string" ? v : JSON.stringify(v)));

describe("mangled session tokens", () => {
  const valid = tokenOf(sessionCookie(8101));
  const [body, mac] = valid.split(".") as [string, string];

  it("refuses a truncated, empty, extended or re-cased MAC, and extra parts", async () => {
    for (const t of [
      `${body}.`,
      `${body}.${mac.slice(0, -2)}`,
      `${body}.${mac}00`,
      `${body}.${mac.toUpperCase()}`,
      `${body}.${mac}.x`,
      `${body}`,
      `.${mac}`,
      "",
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one token at a time
      expect(await refusal(await linkAs(`${NAME}=${t}`))).toEqual([401, "unauthenticated"]);
    }
  });

  it("refuses a body re-encoded without the key (padding, standard alphabet)", async () => {
    for (const b of [`${body}=`, `${body}==`, `${body.replaceAll("_", "/")}+`]) {
      // oxlint-disable-next-line no-await-in-loop -- one token at a time
      expect(await refusal(await linkAs(`${NAME}=${b}.${mac}`))).toEqual([401, "unauthenticated"]);
    }
  });

  it("accepts the same token quoted or percent-encoded (cookie syntax only; the MAC is unchanged)", async () => {
    expect((await linkAs(`${NAME}="${valid}"`)).status).toBe(200);
    expect((await linkAs(`${NAME}=${valid.replace(".", "%2E")}`)).status).toBe(200);
  });
});

describe("cookie name, prefix and duplicates", () => {
  const valid = tokenOf(sessionCookie(8102));

  it("ignores the token under any other name (no prefix, other prefix, other case)", async () => {
    for (const name of [
      "ceremony-session",
      "__Secure-ceremony-session",
      "__host-ceremony-session",
      "__HOST-ceremony-session",
      "__Host-Ceremony-Session",
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one name at a time
      const r = await linkAs(`${name}=${valid}`);
      // oxlint-disable-next-line no-await-in-loop -- one name at a time
      expect([name, ...(await refusal(r))]).toEqual([name, 401, "unauthenticated"]);
    }
    // Whitespace around the name is cookie syntax, not another name.
    expect((await linkAs(` ${NAME} =${valid}`)).status).toBe(200);
  });

  it("reads only the first cookie of the name: a later valid one does not rescue an invalid first", async () => {
    expect(await refusal(await linkAs(`${NAME}=garbage; ${NAME}=${valid}`))).toEqual([
      401,
      "unauthenticated",
    ]);
    expect((await linkAs(`${NAME}=${valid}; ${NAME}=garbage`)).status).toBe(200);
  });
});

describe("a signed token is still read strictly", () => {
  it("refuses claims of the wrong shape even with a valid MAC", async () => {
    const exp = Date.now() + 60_000;
    for (const payload of [
      { gid: 0, login: "a", exp },
      { gid: -5, login: "a", exp },
      { gid: 1.5, login: "a", exp },
      { gid: "5", login: "a", exp },
      { gid: 2 ** 53, login: "a", exp },
      { gid: 5, login: "-x-", exp },
      { gid: 5, login: "a".repeat(40), exp },
      { gid: 5, exp },
      { gid: 5, login: "a", exp: String(exp) },
      { gid: 5, login: "a" },
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one payload at a time
      const r = await linkAs(`${NAME}=${signedBody(b64(payload))}`);
      // oxlint-disable-next-line no-await-in-loop -- one payload at a time
      expect(await refusal(r)).toEqual([401, "unauthenticated"]);
    }
  });

  it("refuses a body that is not a JSON object, without an error answer", async () => {
    for (const body of [b64([1]), b64("null"), b64("{"), b64("1")]) {
      // oxlint-disable-next-line no-await-in-loop -- one body at a time
      expect(await refusal(await linkAs(`${NAME}=${signedBody(body)}`))).toEqual([
        401,
        "unauthenticated",
      ]);
    }
  });

  it("refuses an OAuth state token, and a token of another ceremony, as a session", async () => {
    const state = signToken(
      `oauth-state:${env.CEREMONY_ID}`,
      { gid: 5, login: "a" },
      env.SESSION_KEY,
      60_000,
      Date.now(),
    );
    expect(await refusal(await linkAs(`${NAME}=${state}`))).toEqual([401, "unauthenticated"]);
    const other = signedBody(
      b64({ gid: 5, login: "a", exp: Date.now() + 60_000 }),
      "session:other",
    );
    expect(await refusal(await linkAs(`${NAME}=${other}`))).toEqual([401, "unauthenticated"]);
  });

  it("ignores extra claims (no field grants anything beyond gid and login)", async () => {
    const extra = signedBody(
      b64({ gid: 8103, login: "a", exp: Date.now() + 60_000, operator: true, scope: "admin" }),
    );
    expect((await linkAs(`${NAME}=${extra}`)).status).toBe(200);
    const admin = await appWith({ ENVIRONMENT: "production" }, `${HOST}/admin/state`, {
      method: "POST",
      headers: { cookie: `${NAME}=${extra}`, "x-ceremony-operator": "1" },
    });
    expect(await refusal(admin)).toEqual([403, "forbidden"]);
  });

  it("does not bound exp from above (only a SESSION_KEY holder can mint a token)", async () => {
    const forever = signedBody(b64({ gid: 8104, login: "a", exp: 8.64e15 }));
    expect((await linkAs(`${NAME}=${forever}`)).status).toBe(200);
  });
});
