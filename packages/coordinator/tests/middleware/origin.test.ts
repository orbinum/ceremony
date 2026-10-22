/**
 * Cross-site request forgery (COORDINATOR §3): a state change a browser sends from another origin
 * or site is refused; this origin, and tools sending neither header, get through.
 */
import { describe, expect, it } from "vitest";
import { BASE, call, json, refusal } from "../support";

const leave = (headers: Record<string, string>) =>
  call("POST", "/api/queue/leave", 5001, { headers });

describe("cross-site requests", () => {
  it("refuses a state change a browser sends from another origin or site", async () => {
    const cases: Record<string, string>[] = [
      { origin: "https://evil.example" },
      { origin: "https://app.ceremony.example" },
      { "sec-fetch-site": "cross-site" },
      { "sec-fetch-site": "same-site" },
    ];
    for (const headers of cases) {
      // oxlint-disable-next-line no-await-in-loop -- one case at a time
      const r = await leave(headers);
      // oxlint-disable-next-line no-await-in-loop -- one case at a time
      expect([r.status, (await json(r)).error.code]).toEqual([403, "forbidden"]);
    }
    const logout = await call("POST", "/auth/logout", undefined, {
      headers: { origin: "https://evil.example" },
    });
    expect(await refusal(logout)).toEqual([403, "forbidden"]);
  });

  it("lets through this origin, and tools that send neither header", async () => {
    const cases: Record<string, string>[] = [{ origin: BASE, "sec-fetch-site": "same-origin" }, {}];
    for (const headers of cases) {
      // oxlint-disable-next-line no-await-in-loop -- one case at a time
      expect(await refusal(await leave(headers))).toEqual([503, "not-configured"]);
    }
    const read = await call("GET", "/api/status", undefined, {
      headers: { origin: "https://evil.example" },
    });
    expect(await refusal(read)).toEqual([503, "not-configured"]);
  });

  it("reads a body only as application/json, never a form or plain text", async () => {
    const r = await call("POST", "/api/link", 5002, {
      body: "x",
      headers: { "content-type": "text/plain" },
    });
    expect([r.status, (await json(r)).error.code]).toEqual([400, "malformed"]);
  });
});
