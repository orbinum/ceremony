/**
 * The deployment's configuration (COORDINATOR §3): a weak key, a plaintext or unparsable verifier
 * URL, an unbounded cache lifetime or a malformed ceremony id answers nothing but `internal`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { appWith, json, refusal } from "../support";

const status = (patch: Partial<Env>) => appWith(patch, "http://localhost/api/status");

describe("configuration checked before any request", () => {
  afterEach(() => vi.restoreAllMocks());

  it("refuses to serve with an unusable setting, naming it in the log only", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const patch of [
      { SESSION_KEY: "short" },
      { VERIFIER_HMAC_KEY: "x".repeat(31) },
      { VERIFIER_URL: "http://verifier.example" },
      { VERIFIER_URL: "ftp://localhost" },
      { VERIFIER_URL: "not a url" },
      { PUBLIC_CACHE_SECONDS: "3600" },
      { PUBLIC_CACHE_SECONDS: "-1" },
      { CEREMONY_ID: "Not_An_Id" },
    ] as Partial<Env>[]) {
      // oxlint-disable-next-line no-await-in-loop -- one setting at a time
      const r = await status(patch);
      // oxlint-disable-next-line no-await-in-loop -- one setting at a time
      expect([r.status, await json(r)]).toEqual([
        500,
        { error: { code: "internal", message: "internal error" } },
      ]);
    }
    const logged = errors.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("SESSION_KEY must be at least 32 bytes");
    expect(logged).not.toContain("short");
  });

  it("serves with https or a loopback verifier, and with no verifier at all", async () => {
    for (const VERIFIER_URL of ["", "https://verifier.example", "http://127.0.0.1:8788"]) {
      // oxlint-disable-next-line no-await-in-loop -- one setting at a time
      expect(await refusal(await status({ VERIFIER_URL }))).toEqual([503, "not-configured"]);
    }
  });
});
