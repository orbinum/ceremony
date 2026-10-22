/** The coordinator's admin API: only its own answers count, and the Access token stays on https. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AdminRefusal, adminCall } from "../../src/io";
import { accessHeaders } from "../../src/io/coordinator";
import { rejection } from "../support/errors";
import { json, localServer } from "../support/http";

let server: Awaited<ReturnType<typeof localServer>>;
let elsewhere: Awaited<ReturnType<typeof localServer>>;

beforeAll(async () => {
  elsewhere = await localServer({ "*": (_q, res) => json(res, 200, { ok: true, key: "x" }) });
  server = await localServer({
    "/ok": (_q, res) => json(res, 201, { ok: true, key: "k" }),
    "/redirect": (_q, res) => res.writeHead(302, { location: `${elsewhere.url}/steal` }).end(),
    "/login": (_q, res) =>
      res.writeHead(200, { "content-type": "text/html" }).end("<html>Sign in</html>"),
    "/not-ok": (_q, res) => json(res, 200, { ok: false }),
    "/refused": (_q, res) =>
      json(res, 409, { error: { code: "immutable", message: `\u001b[2K${"x".repeat(5000)}` } }),
  });
});
afterAll(async () => {
  await server.close();
  await elsewhere.close();
});

describe("the coordinator's admin API", () => {
  it("returns the coordinator's own ok answer, without the Access token over plaintext", async () => {
    process.env.CF_ACCESS_CLIENT_ID = "id";
    process.env.CF_ACCESS_CLIENT_SECRET = "secret";
    try {
      expect(await adminCall(server.url, "PUT", "/ok", {}, "x")).toEqual({ ok: true, key: "k" });
      const sent = server.requests.at(-1)?.headers ?? {};
      expect(sent["cf-access-client-secret"]).toBeUndefined();
      expect(sent["cf-access-client-id"]).toBeUndefined();
    } finally {
      delete process.env.CF_ACCESS_CLIENT_ID;
      delete process.env.CF_ACCESS_CLIENT_SECRET;
    }
  });

  it("sends the Access token to an https origin only", () => {
    const env = { CF_ACCESS_CLIENT_ID: "id", CF_ACCESS_CLIENT_SECRET: "secret" };
    expect(accessHeaders("https://coordinator.example", env)).toEqual({
      "cf-access-client-id": "id",
      "cf-access-client-secret": "secret",
    });
    expect(accessHeaders("http://127.0.0.1:8787", env)).toEqual({});
    expect(accessHeaders("https://coordinator.example", { CF_ACCESS_CLIENT_ID: "id" })).toEqual({});
  });

  it("never follows a redirect, so the Access secret goes nowhere else", async () => {
    process.env.CF_ACCESS_CLIENT_ID = "id";
    process.env.CF_ACCESS_CLIENT_SECRET = "secret";
    try {
      await expect(adminCall(server.url, "PUT", "/redirect", {}, "x")).rejects.toThrow(
        /fetch failed/,
      );
      expect(elsewhere.requests).toEqual([]);
    } finally {
      delete process.env.CF_ACCESS_CLIENT_ID;
      delete process.env.CF_ACCESS_CLIENT_SECRET;
    }
  });

  it("does not take a 200 that is not the coordinator's ok answer as success", async () => {
    await expect(adminCall(server.url, "POST", "/login", {}, "{}")).rejects.toThrow(
      /not a JSON answer/,
    );
    await expect(adminCall(server.url, "POST", "/not-ok", {}, "{}")).rejects.toThrow(
      /did not answer ok/,
    );
  });

  it("reports a refusal with a bounded, terminal-safe body", async () => {
    const error = await rejection(adminCall(server.url, "PUT", "/refused", {}, "x"));
    expect(error).toBeInstanceOf(AdminRefusal);
    expect(error).toMatchObject({ status: 409, code: "immutable" });
    expect(error.message).toMatch(/^PUT \/refused: 409 /);
    expect(error.message.includes("\u001b")).toBe(false);
    expect(error.message.length).toBeLessThan(600);
  });
});
