/** The service's environment (COORDINATOR §5): every variable validated, none echoed. */
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { VERIFIER_TIMEOUT_MS } from "@orbinum-ceremony/core";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../../src/service";

const KEY = "a-shared-key-of-at-least-32-bytes!!";
const ENV = {
  COORDINATOR_URL: "https://coordinator.example",
  VERIFIER_HMAC_KEY: KEY,
  CEREMONY_DIR: "/srv/ceremony",
  PTAU: "/srv/ptau",
};
const load = (over: Record<string, string | undefined>) => () => loadConfig({ ...ENV, ...over });

const PACKAGE_JSON = join(import.meta.dirname, "..", "..", "..", "package.json");

describe("service config", () => {
  it("reads a valid environment with its defaults", async () => {
    const { version } = JSON.parse(await readFile(PACKAGE_JSON, "utf8")) as { version: string };
    expect(loadConfig(ENV)).toEqual({
      coordinatorUrl: "https://coordinator.example",
      hmacKey: KEY,
      host: "127.0.0.1",
      port: 8788,
      ceremonyDir: resolve("/srv/ceremony"),
      ptau: resolve("/srv/ptau"),
      logDir: join(resolve("/srv/ceremony"), "logs"),
      timeoutMs: VERIFIER_TIMEOUT_MS.max,
      version,
    });
    expect(
      loadConfig({ ...ENV, PORT: "1", VERIFY_TIMEOUT_MS: "10000", LOG_DIR: "/var/log/v" }),
    ).toMatchObject({ port: 1, timeoutMs: 10_000, logDir: "/var/log/v" });
  });

  it.each(["127.0.0.1", "::1", "0.0.0.0", "10.1.2.3", "localhost"])(
    "takes HOST %j (an IP literal or localhost)",
    (host) => expect(loadConfig({ ...ENV, HOST: host }).host).toBe(host),
  );

  it.each(["", " ", "[::1]", "example.com", "127.0.0.1:80", "localhost."])(
    "refuses HOST %j instead of binding every interface or resolving a name",
    (host) => expect(load({ HOST: host })).toThrow("HOST: must be an IP address or localhost"),
  );

  it("names every missing variable", () => {
    expect(() => loadConfig({})).toThrow(
      "missing environment: COORDINATOR_URL, VERIFIER_HMAC_KEY, CEREMONY_DIR, PTAU",
    );
    expect(load({ PTAU: "" })).toThrow("missing environment: PTAU");
  });

  it.each([
    ["not a url", "COORDINATOR_URL: not a URL"],
    ["ftp://coordinator.example", "must be https:"],
    ["http://coordinator.example", "must be https:"],
    ["http://10.0.0.1:8787", "must be https:"],
    ["https://user:pass@coordinator.example", "may not carry credentials"],
    ["https://coordinator.example/api", "must be an origin"],
    ["https://coordinator.example/?x=1", "must be an origin"],
    ["https://coordinator.example/#h", "must be an origin"],
  ])("refuses COORDINATOR_URL %s", (url, message) => {
    expect(load({ COORDINATOR_URL: url })).toThrow(message);
    // The value itself (which may carry credentials) is never echoed.
    expect(load({ COORDINATOR_URL: url })).not.toThrow(url);
  });

  it.each(["http://127.0.0.1:8787", "http://localhost:8787", "http://[::1]:8787"])(
    "allows http: on loopback (%s)",
    (url) => expect(loadConfig({ ...ENV, COORDINATOR_URL: url }).coordinatorUrl).toBe(url),
  );

  it("keeps the origin only, with or without a trailing slash", () => {
    expect(loadConfig({ ...ENV, COORDINATOR_URL: "https://c.example:8443/" }).coordinatorUrl).toBe(
      "https://c.example:8443",
    );
  });

  it.each(["0", "65536", "-1", "80.5", "abc", "1e3", " 80", "99999999999999999"])(
    "refuses PORT %j",
    (port) => expect(load({ PORT: port })).toThrow("PORT: must be an integer in [1, 65535]"),
  );

  it.each([
    "0",
    String(VERIFIER_TIMEOUT_MS.min - 1),
    String(VERIFIER_TIMEOUT_MS.max + 1),
    "NaN",
    "2147483648",
    "30000.5",
  ])("refuses VERIFY_TIMEOUT_MS %j", (ms) =>
    expect(load({ VERIFY_TIMEOUT_MS: ms })).toThrow(
      `VERIFY_TIMEOUT_MS: must be an integer in [${VERIFIER_TIMEOUT_MS.min}, ${VERIFIER_TIMEOUT_MS.max}]`,
    ),
  );

  it("refuses a short key without echoing it", () => {
    const short = "short-secret-key";
    let message = "";
    try {
      loadConfig({ ...ENV, VERIFIER_HMAC_KEY: short });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("VERIFIER_HMAC_KEY: HMAC key must be at least 32 bytes");
    expect(message).not.toContain(short);
  });

  it("lists every invalid variable at once", () => {
    expect(
      load({ COORDINATOR_URL: "http://x.example", PORT: "0", VERIFY_TIMEOUT_MS: "1" }),
    ).toThrow(/COORDINATOR_URL: .*; PORT: .*; VERIFY_TIMEOUT_MS: /);
  });
});
