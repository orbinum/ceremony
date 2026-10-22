/**
 * Attacks every state-changing route with cross-site requests (COORDINATOR §3): hostile, null,
 * re-cased and re-ported origins, `Sec-Fetch-Site` values, and the body types a form can send.
 */
import { describe, expect, it } from "vitest";
import { appWith, call, freshId, json, refusal } from "../support";

/** Every route that changes state, as `[method, path]`. */
const STATE_CHANGING: [string, string][] = [
  ["POST", "/api/link/nonce"],
  ["POST", "/api/link"],
  ["POST", "/api/queue/join"],
  ["POST", "/api/queue/leave"],
  ["POST", "/api/session/claim"],
  ["POST", "/api/session/heartbeat"],
  ["POST", "/api/session/finish"],
  ["POST", "/api/session/attest"],
  ["PUT", "/api/session/upload/shield"],
  ["POST", "/auth/logout"],
  // Percent-encoded paths route to the same handlers; the guard must follow them.
  ["POST", "/api/queue/%6Ceave"],
  ["POST", "/auth/logou%74"],
];

const HOSTILE: Record<string, string>[] = [
  { origin: "null" },
  { origin: "https://evil.example" },
  { origin: "HTTP://LOCALHOST" },
  { origin: "http://localhost/" },
  { origin: "http://localhost:80" },
  { origin: "http://localhost:8787" },
  { origin: "https://localhost" },
  { origin: "http://localhost.evil.example" },
  { "sec-fetch-site": "cross-site" },
  { "sec-fetch-site": "same-site" },
  { "sec-fetch-site": "SAME-ORIGIN" },
  { "sec-fetch-site": "" },
  { origin: "http://localhost", "sec-fetch-site": "cross-site" },
  { origin: "https://evil.example", "sec-fetch-site": "same-origin" },
];

describe("cross-site state changes", () => {
  for (const [method, path] of STATE_CHANGING) {
    it(`refuses ${method} ${path} from any other origin or site`, async () => {
      for (const headers of HOSTILE) {
        // oxlint-disable-next-line no-await-in-loop -- one case at a time
        const r = await call(method, path, 9001, { headers });
        // oxlint-disable-next-line no-await-in-loop -- one case at a time
        expect([JSON.stringify(headers), ...(await refusal(r))]).toEqual([
          JSON.stringify(headers),
          403,
          "forbidden",
        ]);
      }
    });
  }

  it("refuses an empty Origin when it reaches the Worker (workerd's fetch drops it in transit)", async () => {
    const direct = await appWith({}, "http://localhost/api/queue/leave", {
      method: "POST",
      headers: { origin: "", "x-dev-github-id": "9005", "cf-connecting-ip": "10.201.0.1" },
    });
    expect(await refusal(direct)).toEqual([403, "forbidden"]);
  });

  it("lets this exact origin through, and safe methods from anywhere", async () => {
    const own = await call("POST", "/api/queue/leave", 9002, {
      headers: { origin: "http://localhost", "sec-fetch-site": "same-origin" },
    });
    expect((await refusal(own))[1]).not.toBe("forbidden");
    const head = await call("HEAD", "/api/status", undefined, {
      headers: { origin: "https://evil.example" },
    });
    expect(head.status).not.toBe(403);
  });

  it("answers no CORS preflight, so no page can add the operator header", async () => {
    const r = await call("OPTIONS", "/admin/state", undefined, {
      headers: {
        origin: "https://evil.example",
        "access-control-request-method": "POST",
        "access-control-request-headers": "x-ceremony-operator",
      },
    });
    expect(r.headers.get("access-control-allow-origin")).toBeNull();
    expect(r.headers.get("access-control-allow-headers")).toBeNull();
  });
});

/** `/admin/state` (local) tells parsing apart: an unparsed body is `{}`, answered `malformed`. */
const state = (contentType: string) =>
  call("POST", "/admin/state", undefined, {
    ceremony: freshId("origin-attacks"),
    headers: { "content-type": contentType },
    body: { action: "pause" },
  }).then(async (r) => [r.status, (await json(r)).error?.code]);

describe("a body is parsed only when typed as JSON", () => {
  it("never parses text/plain, a form or multipart (what a cross-site form can send)", async () => {
    for (const type of [
      "text/plain",
      "text/plain;charset=UTF-8",
      "application/x-www-form-urlencoded",
      "multipart/form-data; boundary=x",
      "application/json, text/plain",
      "application/jsonp",
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one type at a time
      expect([type, ...(await state(type))]).toEqual([type, 400, "malformed"]);
    }
  });

  it("parses application/json in any case and with parameters (not a simple-request type)", async () => {
    for (const type of ["application/json", "application/JSON", "application/json;charset=x"]) {
      // oxlint-disable-next-line no-await-in-loop -- one type at a time
      const [status, code] = await state(type);
      expect([type, status === 400 && code === "malformed"]).toEqual([type, false]);
    }
  });
});
