/**
 * Hostile values for the verifier service's environment: each one refused, the key never echoed.
 */
import { VERIFIER_TIMEOUT_MS } from "@orbinum-ceremony/core";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../../src/service";

const KEY = "test-key-of-at-least-32-bytes-0123456789";
const ENV = {
  COORDINATOR_URL: "https://coordinator.example",
  VERIFIER_HMAC_KEY: KEY,
  CEREMONY_DIR: "/srv/ceremony",
  PTAU: "/srv/ptau",
};
const load = (over: Record<string, string | undefined>) => loadConfig({ ...ENV, ...over });
const refused = (over: Record<string, string | undefined>) => {
  try {
    load(over);
  } catch (e) {
    return (e as Error).message;
  }
  return undefined;
};

describe("COORDINATOR_URL", () => {
  it.each([
    ["credentials", "https://user:pw@coordinator.example"],
    ["a username only", "https://localhost@evil.example"],
    ["a path", "https://coordinator.example/api"],
    ["a query", "https://coordinator.example/?x=1"],
    ["a fragment", "https://coordinator.example/#x"],
    ["plain http off loopback", "http://coordinator.example"],
    ["http on 127.0.0.2 (loopback, but not in the list)", "http://127.0.0.2:8787"],
    ["http on localhost. (trailing dot)", "http://localhost.:8787"],
    ["http on an IPv4-mapped IPv6 loopback", "http://[::ffff:127.0.0.1]:8787"],
    ["file:", "file:///etc/passwd"],
    ["data:", "data:text/plain,x"],
    ["ws:", "ws://127.0.0.1:8787"],
    ["not a URL", "coordinator.example"],
  ])("refuses %s", (_, url) => {
    expect(refused({ COORDINATOR_URL: url })).toMatch(/COORDINATOR_URL/);
  });

  it.each([
    ["IPv6 loopback over http", "http://[::1]:8787", "http://[::1]:8787"],
    ["IPv4 shorthand normalized to loopback", "http://127.1:8787", "http://127.0.0.1:8787"],
    ["hex IPv4 normalized to loopback", "http://0x7f000001:8787", "http://127.0.0.1:8787"],
    ["a trailing slash", "https://coordinator.example/", "https://coordinator.example"],
    [
      "a dot path segment (resolves to /)",
      "https://coordinator.example/./",
      "https://coordinator.example",
    ],
    [
      "an empty query and fragment (WHATWG drops them)",
      "https://coordinator.example/?#",
      "https://coordinator.example",
    ],
    ["the default port", "https://coordinator.example:443", "https://coordinator.example"],
  ])("takes %s as its origin only", (_, url, origin) => {
    expect(load({ COORDINATOR_URL: url }).coordinatorUrl).toBe(origin);
  });

  it("never echoes the key, even when it is also the URL's password", () => {
    const message = refused({ COORDINATOR_URL: `https://u:${KEY}@c.example`, PORT: "0" });
    expect(message).toBeDefined();
    expect(message).not.toContain(KEY);
  });
});

describe("HOST, PORT and VERIFY_TIMEOUT_MS", () => {
  it.each([
    ["", "HOST"],
    [" 127.0.0.1", "HOST"],
    ["127.0.0.1:80", "HOST"],
    ["example.com", "HOST"],
    ["localhost.", "HOST"],
  ])("refuses HOST %j", (host, name) => {
    expect(refused({ HOST: host })).toMatch(new RegExp(name));
  });

  it("takes the wildcard addresses 0.0.0.0 and :: (exposure is left to the firewall)", () => {
    expect(load({ HOST: "0.0.0.0" }).host).toBe("0.0.0.0");
    expect(load({ HOST: "::" }).host).toBe("::");
  });

  it.each(["0", "65536", "-1", "+80", "80.0", "8e3", "", " 80", "0x50", "99999999999999999"])(
    "refuses PORT %j",
    (port) => {
      expect(refused({ PORT: port })).toMatch(/PORT/);
    },
  );

  it("takes a zero-padded PORT as its number", () => {
    expect(load({ PORT: "08788" }).port).toBe(8788);
  });

  it.each([
    "1e5",
    "",
    String(VERIFIER_TIMEOUT_MS.min - 1),
    String(VERIFIER_TIMEOUT_MS.max + 1),
    "100000.5",
    "-100000",
    "Infinity",
    "NaN",
  ])("refuses VERIFY_TIMEOUT_MS %j", (v) => {
    expect(refused({ VERIFY_TIMEOUT_MS: v })).toMatch(/VERIFY_TIMEOUT_MS/);
  });

  it("takes both bounds of VERIFY_TIMEOUT_MS", () => {
    expect(load({ VERIFY_TIMEOUT_MS: String(VERIFIER_TIMEOUT_MS.min) }).timeoutMs).toBe(10_000);
    expect(load({ VERIFY_TIMEOUT_MS: String(VERIFIER_TIMEOUT_MS.max) }).timeoutMs).toBe(270_000);
  });

  it("names every bad variable at once and never the key", () => {
    const message = refused({
      VERIFIER_HMAC_KEY: "short-secret-value",
      HOST: "",
      PORT: "0",
      VERIFY_TIMEOUT_MS: "1e5",
      COORDINATOR_URL: "http://x.example",
    });
    expect(message).toMatch(/COORDINATOR_URL.*VERIFIER_HMAC_KEY.*HOST.*PORT.*VERIFY_TIMEOUT_MS/);
    expect(message).not.toContain("short-secret-value");
  });
});
