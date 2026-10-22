/**
 * The wire contracts both sides share: errors, job names, specs and sign-in outcomes. COORDINATOR
 * §3, §5.
 */
import { describe, expect, it } from "vitest";
import { MAX_CONTRIBUTIONS, MAX_JOB_SPEC_BYTES } from "../../../src/config";
import {
  apiErrorStatus,
  INTERNAL_PATHS,
  isJobObjectKey,
  type Job,
  jobObjectKey,
  jobResultView,
  jobSpecOf,
  newJob,
  signedRequestInit,
  signInQuery,
  storedReport,
  validateJobSpec,
  type VerifierReport,
  verifyRequest,
} from "../../../src/coordination/protocol";

const KEY = "verifier-key-of-32-bytes-or-more";
const CLAIM = {
  inputSha256: "aa".repeat(32),
  outputSha256: "bb".repeat(32),
  contributionHash: "cc".repeat(64),
  method: "cli" as const,
  client: { name: "c", version: "1", commit: "abc1234" },
};
const job = (patch: Partial<Job> = {}): Job => ({
  ...newJob({
    job: { seq: 1, circuit: "shield", attempt: 10, index: 2 },
    githubId: 7,
    key: "verify/1/shield/10-ab.zkey",
    size: 99,
    claim: CLAIM,
  }),
  ...patch,
});

describe("error contract", () => {
  it("maps every code to its status, conflicts by default", () => {
    expect(apiErrorStatus("malformed")).toBe(400);
    expect(apiErrorStatus("unauthenticated")).toBe(401);
    expect(apiErrorStatus("forbidden")).toBe(403);
    expect(apiErrorStatus("not-found")).toBe(404);
    expect(apiErrorStatus("too-large")).toBe(413);
    expect(apiErrorStatus("rate-limited")).toBe(429);
    expect(apiErrorStatus("internal")).toBe(500);
    expect(apiErrorStatus("storage")).toBe(503);
    expect(apiErrorStatus("busy")).toBe(409);
  });
});

describe("jobs", () => {
  it("names each upload's private object under its job, never under another attempt", () => {
    const id = { seq: 1, circuit: "shield" as const, attempt: 1 };
    const key = jobObjectKey(id, "ab12");
    expect(key).toBe("verify/1/shield/1-ab12.zkey");
    expect(isJobObjectKey(id, key)).toBe(true);
    expect(isJobObjectKey({ ...id, attempt: 10 }, key)).toBe(false);
    expect(isJobObjectKey(id, "verify/1/shield/10-ab12.zkey")).toBe(false);
  });

  it("creates a pending job and the spec its verifier gets", () => {
    const j = job();
    expect(j).toMatchObject({ status: "pending", outcome: null, report: null, index: 2 });
    const head = { outputSha256: CLAIM.inputSha256, csHash: "dd".repeat(64), previous: [] };
    expect(jobSpecOf(j, head, "ee".repeat(32))).toEqual({
      job: { seq: 1, circuit: "shield", attempt: 10, index: 2 },
      claim: CLAIM,
      size: 99,
      head,
      genesisSha256: "ee".repeat(32),
    });
  });

  it("keeps a report without its log, and shows a contributor only the reason", () => {
    const valid = {
      job: { seq: 1, circuit: "shield", attempt: 10, index: 2 },
      result: "valid",
      contributionHash: CLAIM.contributionHash,
      zkeyName: "n",
      deltaAfter: "ff".repeat(64),
      logSha256: "00".repeat(32),
      log: "x".repeat(10_000),
      verifierVersion: "1",
      snarkjsVersion: "0.7.6",
    } as VerifierReport;
    expect(storedReport(valid)).not.toHaveProperty("log");
    expect(
      jobResultView(job({ status: "done", outcome: "valid", report: storedReport(valid) })),
    ).toEqual({
      seq: 1,
      attempt: 10,
      index: 2,
      output_sha256: CLAIM.outputSha256,
      status: "valid",
    });
    const rejected = {
      job: valid.job,
      result: "rejected",
      reason: "zkey-verify-failed",
      detail: "internal detail",
    } as VerifierReport;
    expect(jobResultView(job({ status: "done", outcome: "rejected", report: rejected }))).toEqual({
      seq: 1,
      attempt: 10,
      index: 2,
      output_sha256: CLAIM.outputSha256,
      status: "rejected",
      reason: "zkey-verify-failed",
    });
    expect(jobResultView(job({ status: "stale" })).status).toBe("stale");
  });
});

describe("signed requests", () => {
  it("builds a request the other side verifies, path and body bound", () => {
    const url = new URL(INTERNAL_PATHS.verifications, "http://coordinator.test");
    const body = '{"a":1}';
    const init = signedRequestInit(KEY, "unit-test-1", "POST", url, body, 5000);
    const headers = init.headers as Record<string, string>;
    const check = (path: string, b: string) =>
      verifyRequest(
        KEY,
        "unit-test-1",
        "POST",
        path,
        b,
        { timestamp: headers["x-ceremony-timestamp"], signature: headers["x-ceremony-signature"] },
        5000,
      );
    expect(headers["content-type"]).toBe("application/json");
    expect(check(url.pathname, body)).toBe(true);
    expect(check(url.pathname, '{"a":2}')).toBe(false);
    expect(check(INTERNAL_PATHS.object({ seq: 1, circuit: "shield", attempt: 1 }), body)).toBe(
      false,
    );
  });
});

describe("verifier logs and keys", () => {
  it("publishes a log as bounded printable text, and records each attempt under its job", async () => {
    const { attemptLogKey, checkHmacKey, publishedLogOf, verifierLogOf } =
      await import("../../../src/coordination/protocol");
    expect(publishedLogOf("ok \u001b[31m€\n")).toBe("ok ?[31m?\n");
    const spec = { seq: 3, circuit: "shield" as const, attempt: 2, index: 5 };
    expect(attemptLogKey(spec)).toBe("shield/5-3-2.log");
    expect(verifierLogOf(spec, { result: "infra", detail: "x" }, { verify: 1 }, "log")).toBe(
      `${JSON.stringify({ job: spec, verdict: { result: "infra", detail: "x" }, ms: { verify: 1 } })}\nlog\n`,
    );
    expect(() => checkHmacKey("short")).toThrow(/at least 32 bytes/);
    expect(() => checkHmacKey(KEY)).not.toThrow();
  });
});

describe("job spec size", () => {
  it("fits a head of MAX_CONTRIBUTIONS worst-case entries in MAX_JOB_SPEC_BYTES", () => {
    const entry = { hash: "ab".repeat(64), name: '"'.repeat(64), deltaAfter: "cd".repeat(64) };
    const head = {
      outputSha256: "ee".repeat(32),
      csHash: "ff".repeat(64),
      previous: Array.from({ length: MAX_CONTRIBUTIONS - 1 }, () => entry),
    };
    const spec = jobSpecOf(job({ index: MAX_CONTRIBUTIONS }), head, "11".repeat(32));
    const body = JSON.stringify(spec);
    expect(body.length).toBeGreaterThan(4_000_000);
    expect(body.length).toBeLessThanOrEqual(MAX_JOB_SPEC_BYTES);
    expect(validateJobSpec(JSON.parse(body)).head.previous).toHaveLength(MAX_CONTRIBUTIONS - 1);
  });
});

describe("sign-in outcome", () => {
  it("is the query string the client reads", () => {
    expect(signInQuery({ auth: "ok" })).toBe("auth=ok");
    expect(signInQuery({ auth: "cancelled" })).toBe("auth=cancelled");
    expect(
      signInQuery({ auth: "ineligible", reasons: ["created-after-cutoff", "account-too-new"] }),
    ).toBe("auth=ineligible&reasons=created-after-cutoff,account-too-new");
    expect(signInQuery({ auth: "error", reason: "github" })).toBe("auth=error&reason=github");
  });
});
