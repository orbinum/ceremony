/**
 * The contributor API as the CLI calls it: the token goes only to the coordinator's fixed paths,
 * never through a redirect and never with a download; downloads are bounded and kept only if they
 * hash to what was announced.
 */
import { sha256Hex } from "@orbinum-ceremony/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ContributorRefusal, contributorCall, fetchAnnounced } from "../../src/io";
import { rejection } from "../support/errors";
import { json, localServer } from "../support/http";

const TOKEN = `${"a".repeat(40)}.${"0".repeat(64)}`;
const ZKEY = new TextEncoder().encode("an announced head");

let server: Awaited<ReturnType<typeof localServer>>;
let elsewhere: Awaited<ReturnType<typeof localServer>>;

beforeAll(async () => {
  elsewhere = await localServer({ "*": (_q, res) => json(res, 200, { stolen: true }) });
  server = await localServer({
    "/api/queue/me": (_q, res) => json(res, 200, { phase: "OPEN", position: 1, slot: null }),
    "/api/session/claim": (_q, res) =>
      res.writeHead(302, { location: `${elsewhere.url}/steal` }).end(),
    "/api/session/heartbeat": (_q, res) =>
      json(res, 409, {
        error: { code: "not-your-slot", message: `\u001b[2K\nforged\n${"x".repeat(5000)}` },
      }),
    "/api/session/finish": (_q, res) =>
      res.writeHead(200, { "content-type": "text/html" }).end("<html>Sign in</html>"),
    "/artifacts/contributions/shield/1.zkey": (_q, res) => res.writeHead(200).end(ZKEY),
    "/artifacts/redirect.zkey": (_q, res) =>
      res.writeHead(302, { location: `${elsewhere.url}/x` }).end(),
    "/artifacts/big.zkey": (_q, res) => res.writeHead(200).end(Buffer.alloc(4096)),
  });
});
afterAll(async () => {
  await server.close();
  await elsewhere.close();
});

const who = () => ({ origin: server.url, token: TOKEN });

describe("the contributor API", () => {
  it("sends the token as a bearer, to the coordinator only", async () => {
    expect(await contributorCall(who(), "GET", "/api/queue/me")).toMatchObject({ position: 1 });
    const sent = server.requests.find((r) => r.path === "/api/queue/me");
    expect(sent?.headers.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("never follows a redirect, so the token never reaches another host", async () => {
    await rejection(contributorCall(who(), "POST", "/api/session/claim"));
    expect(elsewhere.requests).toEqual([]);
  });

  it("reports a refusal on one line, bounded, with its code", async () => {
    const error = await rejection(contributorCall(who(), "POST", "/api/session/heartbeat"));
    expect(error).toBeInstanceOf(ContributorRefusal);
    expect(error).toMatchObject({ status: 409, code: "not-your-slot" });
    expect(error.message).not.toContain("\n");
    expect(error.message).not.toContain("\u001b");
    expect(error.message.length).toBeLessThan(700);
  });

  it("refuses an answer that is not JSON", async () => {
    expect(
      (await rejection(contributorCall(who(), "POST", "/api/session/finish"))).message,
    ).toMatch(/not a JSON answer/);
  });
});

describe("announced downloads", () => {
  it("keeps a head that hashes to the announced value, fetched without the token", async () => {
    const bytes = await fetchAnnounced(
      server.url,
      "/artifacts/contributions/shield/1.zkey",
      sha256Hex(ZKEY),
      1024,
    );
    expect(bytes).toEqual(ZKEY);
    const sent = server.requests.find((r) => r.path === "/artifacts/contributions/shield/1.zkey");
    expect(sent?.headers.authorization).toBeUndefined();
  });

  it("refuses other bytes, a larger file, a redirect and any path outside the artifacts", async () => {
    const path = "/artifacts/contributions/shield/1.zkey";
    expect(
      (await rejection(fetchAnnounced(server.url, path, "00".repeat(32), 1024))).message,
    ).toMatch(/does not match/);
    expect(
      (await rejection(fetchAnnounced(server.url, "/artifacts/big.zkey", "00".repeat(32), 1024)))
        .message,
    ).toMatch(/larger than/);
    await rejection(fetchAnnounced(server.url, "/artifacts/redirect.zkey", "00".repeat(32), 1024));
    expect(elsewhere.requests).toEqual([]);
    const bad = [
      "https://evil.example/artifacts/x.zkey",
      "//evil.example/artifacts/x.zkey",
      "/api/queue/me",
      "/artifacts/../api/queue/me",
      "/artifacts/./x.zkey",
      "/artifacts//x.zkey",
      "/artifacts/x.zkey?token=1",
      "/artifacts/%2e%2e/x",
      "/artifacts/",
    ];
    const answers = await Promise.all(
      bad.map(
        async (p) =>
          (await rejection(fetchAnnounced(server.url, p, "00".repeat(32), 1024))).message,
      ),
    );
    expect(answers).toEqual(bad.map(() => "the coordinator announced an unexpected path"));
  });
});
