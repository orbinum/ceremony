/**
 * Attacks rate limiting: routes that skip their limiter, client address spellings (IPv6 /64,
 * IPv4-mapped, IPv4-compatible and 6to4, zone ids, case, whitespace), and requests without an
 * address.
 */
import { describe, expect, it } from "vitest";
import { networkOf } from "../../../src/middleware/limits/network-of";
import { appWith, call, countingLimiter, freshId, refusal } from "../../support";

const REFUSE_ALL = {
  JOIN_LIMIT: countingLimiter(0).binding,
  NONCE_LIMIT: countingLimiter(0).binding,
  UPLOAD_LIMIT: countingLimiter(0).binding,
  ACTION_LIMIT: countingLimiter(0).binding,
  READ_LIMIT: countingLimiter(0).binding,
  POLL_LIMIT: countingLimiter(0).binding,
  AUTH_LIMIT: countingLimiter(0).binding,
  ARTIFACT_LIMIT: countingLimiter(0).binding,
} as Partial<Env>;

const statusFrom = (ip: string | undefined) =>
  appWith({ ENVIRONMENT: "production" }, "https://ceremony.example/api/status", {
    headers: ip === undefined ? {} : { "cf-connecting-ip": ip },
  });

const LIMITED: [string, string, number | undefined][] = [
  ["GET", "/api/status", undefined],
  ["GET", "/api/transcript", undefined],
  ["GET", "/api/receipt/1", undefined],
  ["GET", "/auth/github", undefined],
  ["GET", "/auth/github/callback?code=c&state=s", undefined],
  ["POST", "/auth/logout", undefined],
  ["GET", "/api/link", 9201],
  ["POST", "/api/link/nonce", 9201],
  ["POST", "/api/link", 9201],
  ["POST", "/api/queue/leave", 9201],
  ["GET", "/api/queue/me", 9201],
  ["POST", "/api/session/claim", 9201],
  ["POST", "/api/session/heartbeat", 9201],
  ["POST", "/api/session/finish", 9201],
  ["GET", "/api/session/head/shield", 9201],
  ["GET", "/api/session/result/shield", 9201],
  ["POST", "/api/session/attest", 9201],
  ["PUT", "/api/session/upload/shield", 9201],
];

describe("every route has a limiter", () => {
  it("refuses every contributor and public route when its limiter refuses", async () => {
    for (const [method, path, id] of LIMITED) {
      const r = await call(method, path, id, {
        env: REFUSE_ALL,
        ceremony: freshId("abuse-attacks"),
      });
      expect([method, path, ...(await refusal(r))]).toEqual([method, path, 429, "rate-limited"]);
    }
  });

  it("limits public artifact downloads per client network", async () => {
    const r = await call("GET", "/artifacts/genesis/shield.zkey", undefined, { env: REFUSE_ALL });
    expect(await refusal(r)).toEqual([429, "rate-limited"]);
  });

  it("refuses an unsigned /internal call by its MAC and answers unknown paths, with no limiter in the way", async () => {
    const internal = await appWith(REFUSE_ALL, "http://localhost/internal/verifications", {
      method: "POST",
      headers: {
        "x-ceremony-timestamp": String(Date.now()),
        "x-ceremony-signature": "0".repeat(64),
        "content-type": "application/json",
      },
      body: JSON.stringify({ pad: "x".repeat(100_000) }),
    });
    expect(await refusal(internal)).toEqual([401, "unauthenticated"]);
    const notFound = await appWith(REFUSE_ALL, "http://localhost/nothing-here");
    expect(await refusal(notFound)).toEqual([404, "not-found"]);
  });
});

describe("client network keys", () => {
  it("refuses a request without a usable address outside a local run", async () => {
    for (const ip of [undefined, "", "unknown", "fe80::1%eth0", "10.0.0.1, 10.0.0.2"]) {
      const r = await statusFrom(ip);
      expect([ip, ...(await refusal(r))]).toEqual([ip, 403, "forbidden"]);
    }
    expect((await statusFrom(" 10.0.0.1")).status).not.toBe(403);
  });

  it("keys every spelling of one IPv6 /64, and IPv4-mapped forms, to one bucket", () => {
    expect(
      new Set(
        [
          "2001:DB8:A:B::1",
          "2001:db8:a:b:0:0:0:2",
          "2001:0db8:000a:000b::ffff",
          "2001:db8:a:b:1:2:3.4.5.6",
        ].map(networkOf),
      ),
    ).toEqual(new Set(["2001:db8:a:b::/64"]));
    expect(networkOf("::FFFF:10.0.0.1")).toBe("10.0.0.1");
    expect(networkOf("::ffff:a00:1")).toBe("10.0.0.1");
    expect(networkOf("0:0:0:0:0:ffff:10.0.0.1")).toBe("10.0.0.1");
  });

  it("gives each /64 of a delegated /48 or /56 its own bucket", () => {
    const keys = new Set(
      Array.from({ length: 256 }, (_, i) => networkOf(`2001:db8:a:${i.toString(16)}00::1`)),
    );
    expect(keys.size).toBe(256);
    expect(networkOf("::10.0.0.1")).toBe("0:0:0:0::/64");
    expect(networkOf("2002:a00:1::1")).toBe("2002:a00:1:0::/64");
  });
});
