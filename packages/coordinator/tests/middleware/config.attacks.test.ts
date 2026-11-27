/**
 * Attacks the deployment's configuration checks with near-miss values (key length in bytes, not
 * characters; one secret for sessions and verifier MACs, even padded with a zero byte; a foreign
 * Access team domain), and checks that no configured value leaks into an answer or a log.
 */
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { configProblems } from "../../src/env";
import { appWith, json } from "../support";

const problemsWith = (patch: Partial<Env>) => configProblems({ ...env, ...patch } as Env);

describe("configuration values", () => {
  it("refuses PUBLIC_CACHE_SECONDS that is not a plain decimal in 0–60", () => {
    for (const v of [
      "1e1",
      "0x10",
      " 5",
      "5 ",
      "5.0",
      "+5",
      "-0",
      "٥",
      "61",
      "",
      "1000",
      undefined,
    ]) {
      expect([v, problemsWith({ PUBLIC_CACHE_SECONDS: v } as Partial<Env>).length]).toEqual([v, 1]);
    }
    for (const v of ["0", "60", "060", "5"]) {
      expect(problemsWith({ PUBLIC_CACHE_SECONDS: v })).toEqual([]);
    }
  });

  it("takes the verifier's Access service token whole or not at all", () => {
    const problem = ["VERIFIER_ACCESS_CLIENT_ID and VERIFIER_ACCESS_CLIENT_SECRET go together"];
    expect(problemsWith({ VERIFIER_ACCESS_CLIENT_ID: "id.access" })).toEqual(problem);
    expect(problemsWith({ VERIFIER_ACCESS_CLIENT_SECRET: "s3cret" })).toEqual(problem);
    expect(
      problemsWith({ VERIFIER_ACCESS_CLIENT_ID: "id.access", VERIFIER_ACCESS_CLIENT_SECRET: "s" }),
    ).toEqual([]);
    expect(problemsWith({})).toEqual([]);
  });

  it("refuses keys below 32 UTF-8 bytes, and missing keys", () => {
    for (const v of ["", "x".repeat(31), undefined, "é".repeat(15)]) {
      expect(problemsWith({ SESSION_KEY: v } as Partial<Env>)).toEqual([
        "SESSION_KEY must be at least 32 bytes",
      ]);
    }
    expect(problemsWith({ SESSION_KEY: "é".repeat(16) })).toEqual([]);
  });

  it("refuses malformed ceremony ids", () => {
    for (const v of ["", "A", "a_b", "a.b", "a:b", "a\n", "a".repeat(65), undefined]) {
      expect(problemsWith({ CEREMONY_ID: v } as Partial<Env>)).toEqual([
        "CEREMONY_ID is not a ceremony id",
      ]);
    }
  });

  it("refuses a plaintext or non-loopback http verifier", () => {
    for (const v of [
      "http://verifier.example",
      "http://localhost.",
      "http://127.0.0.2",
      "http://0.0.0.0",
      "http://[::ffff:127.0.0.1]",
      "ws://localhost",
      "//verifier.example",
    ]) {
      expect([v, problemsWith({ VERIFIER_URL: v }).length]).toEqual([v, 1]);
    }
  });

  it("accepts a verifier URL with credentials, a path or a query; dispatch drops path and query", () => {
    for (const v of [
      "https://user:pass@verifier.example",
      "https://verifier.example/sub/path?x=1#f",
    ]) {
      expect(problemsWith({ VERIFIER_URL: v })).toEqual([]);
    }
    expect(new URL("/verify", "https://verifier.example/sub/path?x=1").href).toBe(
      "https://verifier.example/verify",
    );
  });

  it("refuses the same key for sessions and verifier requests, as HMAC sees it", () => {
    const same = ["SESSION_KEY and VERIFIER_HMAC_KEY must differ"];
    expect(problemsWith({ VERIFIER_HMAC_KEY: env.SESSION_KEY })).toEqual(same);
    expect(problemsWith({ VERIFIER_HMAC_KEY: `${env.SESSION_KEY}\u0000` })).toEqual(same);
  });

  it("refuses an ENVIRONMENT other than local, testnet or production", () => {
    for (const ENVIRONMENT of ["staging", "Production", "", "local "]) {
      expect([ENVIRONMENT, problemsWith({ ENVIRONMENT })]).toEqual([
        ENVIRONMENT,
        ["ENVIRONMENT must be one of local, testnet, production"],
      ]);
    }
  });

  it("refuses an Access team domain that is not https://<team>.cloudflareaccess.com", () => {
    for (const v of [
      "http://team.cloudflareaccess.com",
      "https://team.cloudflareaccess.com/",
      "https://evil.example",
    ]) {
      expect([v, problemsWith({ ACCESS_TEAM_DOMAIN: v }).length]).toEqual([v, 1]);
    }
  });
});

describe("configuration errors never leak", () => {
  afterEach(() => vi.restoreAllMocks());

  it("answers a generic 500 and logs setting names only", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const secret = "leak-me-0123456789";
    const r = await appWith(
      {
        SESSION_KEY: secret,
        VERIFIER_URL: `http://${secret}.example`,
        PUBLIC_CACHE_SECONDS: secret,
      },
      "http://localhost/api/status",
    );
    const text = await r.text();
    expect([r.status, text]).toEqual([
      500,
      JSON.stringify({ error: { code: "internal", message: "internal error" } }),
    ]);
    const logged = errors.mock.calls.flat().map(String).join("\n");
    expect(logged).toContain("SESSION_KEY");
    expect(logged).not.toContain(secret);
  });

  it("refuses every route, public files and sign-in included, while misconfigured", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const path of [
      "/artifacts/ceremony.json",
      "/auth/github",
      "/admin/state",
      "/internal/verifications",
    ]) {
      const r = await appWith({ SESSION_KEY: "short" }, `http://localhost${path}`);
      expect([path, r.status, (await json(r)).error.code]).toEqual([path, 500, "internal"]);
    }
  });
  it("needs this deployment's https origin for the verifier container, only when it is used", () => {
    const VERIFIER_CONTAINER = {} as Env["VERIFIER_CONTAINER"];
    const problem = [
      "COORDINATOR_URL must be this deployment's https origin (the verifier container)",
    ];
    for (const url of ["", "http://ceremony.test", "https://ceremony.test/path"]) {
      expect(
        problemsWith({ ENVIRONMENT: "testnet", VERIFIER_CONTAINER, COORDINATOR_URL: url }),
      ).toEqual(problem);
    }
    expect(
      problemsWith({
        ENVIRONMENT: "testnet",
        VERIFIER_CONTAINER,
        COORDINATOR_URL: "https://ceremony.testnet.orbinum.network",
      }),
    ).toEqual([]);
    expect(problemsWith({ COORDINATOR_URL: "" })).toEqual([]);
    expect(
      problemsWith({
        VERIFIER_CONTAINER,
        VERIFIER_URL: "https://verifier.test",
        COORDINATOR_URL: "",
      }),
    ).toEqual([]);
  });

  it("refuses ENVIRONMENT local beside a public COORDINATOR_URL (a deployment overridden)", () => {
    const problem = ["ENVIRONMENT local is for a local run: COORDINATOR_URL names a public origin"];
    for (const url of ["https://ceremony.orbinum.network", "https://127.0.0.1.evil.test", "x"]) {
      expect(problemsWith({ ENVIRONMENT: "local", COORDINATOR_URL: url })).toEqual(problem);
    }
    for (const url of ["", "http://127.0.0.1:8787", "http://localhost:8787"]) {
      expect(problemsWith({ ENVIRONMENT: "local", COORDINATOR_URL: url })).toEqual([]);
    }
    expect(
      problemsWith({
        ENVIRONMENT: "production",
        COORDINATOR_URL: "https://ceremony.orbinum.network",
      }),
    ).toEqual([]);
  });

  it("takes an announcement pin only as 64 lowercase hex digits, or none", () => {
    const problem = ["ANNOUNCEMENT_SHA256 must be empty or 64 lowercase hex digits"];
    for (const pin of ["AB".repeat(32), "ab".repeat(31), "x"]) {
      expect(problemsWith({ ANNOUNCEMENT_SHA256: pin })).toEqual(problem);
    }
    for (const pin of ["", "ab".repeat(32)])
      expect(problemsWith({ ANNOUNCEMENT_SHA256: pin })).toEqual([]);
  });
});
