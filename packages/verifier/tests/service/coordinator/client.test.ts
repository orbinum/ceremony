/** The coordinator client (COORDINATOR §5), against a stubbed `fetch` and fake timers. */
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { requestAuthOf, type VerifierReport, verifyRequest } from "@orbinum-ceremony/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchObject, MAX_ATTEMPTS, postReport, REQUEST_TIMEOUT_MS } from "../../../src/service";
import { CEREMONY_ID, HMAC_KEY } from "../../support";

const EP = {
  coordinatorUrl: "https://coordinator.example",
  hmacKey: HMAC_KEY,
  ceremonyId: CEREMONY_ID,
};
const JOB = { seq: 1, circuit: "shield", attempt: 2, index: 1 } as const;
const REPORT: VerifierReport = { job: JOB, result: "infra", detail: "x" };

type Call = [URL, RequestInit];
let calls: Call[];
let answers: ((init: RequestInit) => Promise<Response>)[];
let dir = "";

const ok =
  (body: string | null, headers: Record<string, string> = {}, status = 200) =>
  () =>
    Promise.resolve(new Response(body, { status, headers }));
const fail = () => () =>
  Promise.reject(new TypeError("fetch failed", { cause: new Error("ECONNREFUSED") }));
/** Pending until the request's signal aborts, then rejected with its reason. */
const hang = () => (init: RequestInit) =>
  new Promise<Response>((_, reject) =>
    init.signal?.addEventListener("abort", () => reject(init.signal?.reason)),
  );

/** A 302: `redirect: "error"` makes fetch reject it; anything else would follow it. */
const redirect = (init: RequestInit) =>
  init.redirect === "error"
    ? Promise.reject(new TypeError("fetch failed", { cause: new Error("unexpected redirect") }))
    : Promise.resolve(Response.redirect("https://elsewhere.example/", 302));

/** Whether `init` carries a MAC that verifies for this exact request of `ceremonyId`. */
const signedFor = (ceremonyId: string, method: string, url: URL, init: RequestInit) => {
  const headers = init.headers as Record<string, string>;
  return verifyRequest(
    HMAC_KEY,
    ceremonyId,
    method,
    url.pathname,
    typeof init.body === "string" ? init.body : "",
    requestAuthOf((name) => headers[name]),
    Date.now(),
  );
};

describe("coordinator client", () => {
  beforeEach(async () => {
    calls = [];
    answers = [];
    dir = await mkdtemp(join(tmpdir(), "orbinum-coordinator-test-"));
    vi.stubGlobal(
      "fetch",
      vi.fn((url: URL, init: RequestInit) => {
        calls.push([url, init]);
        const next = answers.shift();
        if (!next) throw new Error("unexpected fetch");
        return next(init);
      }),
    );
    // Backoff at its lower bound: 250, 500, 1000, 2000 ms.
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("fetchObject", () => {
    it("streams exactly the declared bytes, signed, without redirects or compression", async () => {
      answers.push(ok("0123456789", { "content-length": "10" }));
      const dest = join(dir, "a.zkey");
      expect(await fetchObject(EP, JOB, 10, dest)).toBe(true);
      expect(await readFile(dest, "utf8")).toBe("0123456789");
      const [url, init] = calls[0] as Call;
      expect(url.href).toBe("https://coordinator.example/internal/objects/1/shield/2");
      expect(init).toMatchObject({ method: "GET", redirect: "error" });
      expect(init.headers).toMatchObject({ "accept-encoding": "identity" });
      expect(signedFor(CEREMONY_ID, "GET", url, init)).toBe(true);
      // Bound to the pinned ceremony: the same request does not verify for another one.
      expect(signedFor("another-ceremony", "GET", url, init)).toBe(false);
      expect(init.signal).toBeInstanceOf(AbortSignal);
    });

    it("answers false on 404 (a stale job) and writes nothing", async () => {
      answers.push(ok("gone", {}, 404));
      const dest = join(dir, "b.zkey");
      expect(await fetchObject(EP, JOB, 10, dest)).toBe(false);
      await expect(stat(dest)).rejects.toThrow("ENOENT");
    });

    it("refuses another status reading only the start of its body, not retried when < 500", async () => {
      // A 1 MiB error body: a capped read stops early and cancels the rest.
      let cancelled = false;
      let chunks = 0;
      const body = new ReadableStream<Uint8Array>({
        pull: (c) =>
          ++chunks > 4096 ? c.close() : c.enqueue(new TextEncoder().encode("x".repeat(256))),
        cancel: () => void (cancelled = true),
      });
      answers.push(() => Promise.resolve(new Response(body, { status: 403 })));
      const error = await fetchObject(EP, JOB, 10, join(dir, "c.zkey")).catch((e: Error) => e);
      expect((error as Error).message).toMatch(/^object fetch: the coordinator answered 403 x+$/);
      expect((error as Error).message.length).toBeLessThan(1100);
      expect(cancelled).toBe(true);
      expect(calls).toHaveLength(1);
    });

    it("refuses a declared length other than the job's size", async () => {
      answers.push(ok("0123456789", { "content-length": "10" }));
      await expect(fetchObject(EP, JOB, 9, join(dir, "d.zkey"))).rejects.toThrow(
        "object fetch: unexpected length",
      );
    });

    it("stops a body longer than declared at the size bound", async () => {
      answers.push(ok("0123456789-and-more", { "content-length": "10" }));
      await expect(fetchObject(EP, JOB, 10, join(dir, "e.zkey"))).rejects.toThrow(
        "more than 10 bytes",
      );
    });

    it("refuses a body shorter than declared", async () => {
      answers.push(ok("01234", { "content-length": "10" }));
      await expect(fetchObject(EP, JOB, 10, join(dir, "f.zkey"))).rejects.toThrow(
        "object fetch: shorter than declared",
      );
    });

    it("retries 5xx with backoff, then takes the answer", async () => {
      answers.push(ok("busy", {}, 503), ok("0123456789", { "content-length": "10" }));
      const done = fetchObject(EP, JOB, 10, join(dir, "g.zkey"));
      await vi.advanceTimersByTimeAsync(249);
      expect(calls).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(await done).toBe(true);
      expect(calls).toHaveLength(2);
    });

    it("never follows a redirect", async () => {
      answers.push(...Array.from({ length: MAX_ATTEMPTS }, () => redirect));
      const done = fetchObject(EP, JOB, 10, join(dir, "h.zkey")).catch((e: Error) => e);
      await vi.runAllTimersAsync();
      expect(((await done) as Error).message).toBe(
        "GET /internal/objects/1/shield/2: fetch failed: unexpected redirect",
      );
      expect(calls).toHaveLength(MAX_ATTEMPTS);
    });

    it("gives each request 30 s, and the job's deadline ends the call", async () => {
      const timeouts: number[] = [];
      vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
        timeouts.push(ms);
        const c = new AbortController();
        setTimeout(() => c.abort(new DOMException("timed out", "TimeoutError")), ms);
        return c.signal;
      });
      answers.push(hang(), hang());
      const deadline = new AbortController();
      const done = fetchObject(EP, JOB, 10, join(dir, "i.zkey"), deadline.signal).catch(
        (e: Error) => e,
      );
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
      expect(calls).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1 + 250);
      expect(calls).toHaveLength(2);
      expect(timeouts).toEqual([REQUEST_TIMEOUT_MS, REQUEST_TIMEOUT_MS]);
      deadline.abort(new Error("job deadline"));
      expect(((await done) as Error).message).toBe(
        "GET /internal/objects/1/shield/2: job deadline",
      );
      expect(calls).toHaveLength(2);
    });
  });

  describe("postReport", () => {
    it("posts the signed report once on 2xx", async () => {
      answers.push(ok("{}"));
      await postReport(EP, REPORT);
      const [url, init] = calls[0] as Call;
      expect(url.href).toBe("https://coordinator.example/internal/verifications");
      expect(init).toMatchObject({
        method: "POST",
        redirect: "error",
        body: JSON.stringify(REPORT),
      });
      expect(signedFor(CEREMONY_ID, "POST", url, init)).toBe(true);
      expect(calls).toHaveLength(1);
    });

    it("retries 5xx and network errors until the job's deadline, not a fixed count", async () => {
      // A coordinator down for longer than MAX_ATTEMPTS tries: the result must still get through.
      const down = 3 * MAX_ATTEMPTS;
      answers.push(
        ...Array.from({ length: down }, (_, i) => (i % 2 ? ok("", {}, 503) : fail())),
        ok("{}"),
      );
      const deadline = new AbortController();
      const done = postReport(EP, REPORT, deadline.signal);
      await vi.advanceTimersByTimeAsync(down * 10_000);
      await done;
      expect(calls).toHaveLength(down + 1);
    });

    it("waits at most 10 s between tries", async () => {
      answers.push(...Array.from({ length: 8 }, fail), ok("{}"));
      const done = postReport(EP, REPORT, new AbortController().signal);
      // 250 + 500 + 1000 + 2000 + 4000 + 5000 + 5000 + 5000 at the lower jitter bound.
      await vi.advanceTimersByTimeAsync(22_749);
      expect(calls).toHaveLength(8);
      await vi.advanceTimersByTimeAsync(1);
      await done;
      expect(calls).toHaveLength(9);
    });

    it("retries network errors and 5xx with growing, jittered backoff", async () => {
      answers.push(fail(), ok("", {}, 500), fail(), ok("", {}, 502), ok("{}"));
      const done = postReport(EP, REPORT);
      const at: number[] = [];
      for (const step of [250, 500, 1000, 2000]) {
        // oxlint-disable-next-line no-await-in-loop -- steps the fake clock
        await vi.advanceTimersByTimeAsync(step - 1);
        at.push(calls.length);
        // oxlint-disable-next-line no-await-in-loop -- steps the fake clock
        await vi.advanceTimersByTimeAsync(1);
      }
      await done;
      expect(at).toEqual([1, 2, 3, 4]);
      expect(calls).toHaveLength(5);
    });

    it("jitters each delay within 50–100 % of its step", async () => {
      vi.spyOn(Math, "random").mockReturnValue(0.999);
      answers.push(fail(), ok("{}"));
      const done = postReport(EP, REPORT);
      await vi.advanceTimersByTimeAsync(498);
      expect(calls).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(2);
      await done;
      expect(calls).toHaveLength(2);
    });

    it("gives up after the last attempt", async () => {
      answers.push(...Array.from({ length: MAX_ATTEMPTS }, fail));
      const done = postReport(EP, REPORT).catch((e: Error) => e);
      await vi.runAllTimersAsync();
      expect(((await done) as Error).message).toBe(
        "POST /internal/verifications: fetch failed: ECONNREFUSED",
      );
      expect(calls).toHaveLength(MAX_ATTEMPTS);
    });

    it("reports the last 5xx after the last attempt", async () => {
      answers.push(...Array.from({ length: MAX_ATTEMPTS }, () => ok("down", {}, 503)));
      const done = postReport(EP, REPORT).catch((e: Error) => e);
      await vi.runAllTimersAsync();
      expect(((await done) as Error).message).toBe("report: the coordinator answered 503 down");
      expect(calls).toHaveLength(MAX_ATTEMPTS);
    });

    it("takes a 4xx as final", async () => {
      answers.push(ok('{"error":"stale"}', {}, 409));
      await expect(postReport(EP, REPORT)).rejects.toThrow(
        'report: the coordinator answered 409 {"error":"stale"}',
      );
      expect(calls).toHaveLength(1);
    });

    it("retries a 429 like a 5xx: a throttle is not the coordinator's judgement of the report", async () => {
      answers.push(ok('{"error":{"code":"rate-limited"}}', {}, 429), ok('{"ok":true}'));
      const done = postReport(EP, REPORT);
      await vi.runAllTimersAsync();
      await expect(done).resolves.toBeUndefined();
      expect(calls).toHaveLength(2);
    });

    it("stops retrying once the job's deadline passes", async () => {
      answers.push(fail(), fail());
      const deadline = new AbortController();
      const done = postReport(EP, REPORT, deadline.signal).catch((e: Error) => e);
      await vi.advanceTimersByTimeAsync(100);
      deadline.abort(new Error("job deadline"));
      expect(((await done) as Error).message).toBe("job deadline");
      await vi.runAllTimersAsync();
      expect(calls).toHaveLength(1);
    });
  });
});
