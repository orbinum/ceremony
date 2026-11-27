/**
 * The page's own headers (`public/_headers`): what the contribution and Turnstile need, nothing
 * more. Wallet logos load as announced: inline, or from a wallet's own https URL.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const headers = readFileSync(new URL("../../public/_headers", import.meta.url), "utf8");
const csp = new Map(
  (/Content-Security-Policy: (.+)/.exec(headers)?.[1] ?? "")
    .split(";")
    .map((d) => d.trim().split(/\s+/))
    .map(([name = "", ...values]) => [name, values]),
);

describe("_headers", () => {
  it("lets snarkjs compile wasm and start blob: threads, and Turnstile load", () => {
    expect(csp.get("script-src")).toEqual([
      "'self'",
      "'wasm-unsafe-eval'",
      "https://challenges.cloudflare.com",
    ]);
    expect(csp.get("worker-src")).toEqual(["'self'", "blob:"]);
    expect(csp.get("frame-src")).toEqual(["https://challenges.cloudflare.com"]);
    expect(csp.get("img-src")).toEqual(["'self'", "data:", "blob:", "https:"]);
  });

  it("keeps everything else on this origin and refuses framing", () => {
    expect(csp.get("default-src")).toEqual(["'self'"]);
    expect(csp.get("connect-src")).toEqual(["'self'"]);
    expect(csp.get("object-src")).toEqual(["'none'"]);
    expect(csp.get("base-uri")).toEqual(["'none'"]);
    expect(csp.get("frame-ancestors")).toEqual(["'none'"]);
    expect(headers).toContain("X-Frame-Options: DENY");
    expect(headers).toContain("Cross-Origin-Opener-Policy: same-origin");
    expect(headers).toContain("Strict-Transport-Security: max-age=15552000");
  });
});
