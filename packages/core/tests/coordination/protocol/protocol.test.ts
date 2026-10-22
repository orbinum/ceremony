/**
 * Wire validators and the report reconciliation, both sides of the verifier contract. COORDINATOR
 * §5.
 */
import { describe, expect, it } from "vitest";
import { buildContributionRecord } from "../../../src/ceremony/transcript";
import {
  contributionInputOf,
  jobKey,
  jobObjectPrefix,
  reconcileReport,
  reportOf,
  validateJobId,
  validateClaim,
  validateJobSpec,
  validateReport,
} from "../../../src";

describe("protocol validation", () => {
  const claim = {
    inputSha256: "AA".repeat(32),
    outputSha256: "bb".repeat(32),
    contributionHash: "cc".repeat(64),
    method: "cli",
    client: { name: "client", version: "1.0.0", commit: "abc1234" },
  };
  const job = { seq: 1, circuit: "shield", attempt: 1, index: 1 };

  it("normalizes claim hashes and refuses unknown fields or a non-hex commit", () => {
    expect(validateClaim(claim).inputSha256).toBe("aa".repeat(32));
    expect(() => validateClaim({ ...claim, extra: 1 })).toThrow(/unexpected field "extra"/);
    expect(() => validateClaim({ ...claim, client: { ...claim.client, commit: "main" } })).toThrow(
      /claim\.client\.commit/,
    );
  });

  it("validates a job spec, bounding its size and circuit", () => {
    const spec = {
      job,
      claim,
      size: 100,
      head: { outputSha256: "dd".repeat(32), csHash: "ee".repeat(64), previous: [] },
      genesisSha256: "dd".repeat(32),
    };
    expect(validateJobSpec(spec).job).toEqual(job);
    expect(() => validateJobSpec({ ...spec, size: 2 ** 31 })).toThrow(/spec\.size/);
    expect(() => validateJobSpec({ ...spec, job: { ...job, circuit: "../x" } })).toThrow(
      /spec\.job\.circuit/,
    );
  });

  it("takes exactly the fields of each result", () => {
    expect(validateReport({ job, result: "rejected", reason: "stale-head" })).toEqual({
      job,
      result: "rejected",
      reason: "stale-head",
    });
    expect(() => validateReport({ job, result: "infra" })).toThrow(/missing field "detail"/);
    expect(() =>
      validateReport({ job, result: "ambiguous", detail: "x", contributionHash: "00" }),
    ).toThrow(/unexpected field "contributionHash"/);
    expect(() => validateReport({ job, result: "infra", detail: "line\nbreak" })).toThrow(
      /report\.detail/,
    );
  });
});

describe("strict ids and reports", () => {
  const job = { seq: 1, circuit: "shield", attempt: 1, index: 1 };

  it("accepts job ids as numbers or canonical decimal strings only", () => {
    expect(validateJobId({ seq: "12", circuit: "shield", attempt: 3 })).toEqual({
      seq: 12,
      circuit: "shield",
      attempt: 3,
    });
    for (const seq of ["0x10", " 7 ", "1e1", "01", true, [5], "-1"]) {
      expect(() => validateJobId({ seq, circuit: "shield", attempt: 1 })).toThrow(/job\.seq/);
    }
  });

  it("validates the valid path: hex, name, log text", () => {
    const valid = {
      job,
      result: "valid",
      contributionHash: "AB".repeat(64),
      zkeyName: "alice",
      deltaAfter: "cd".repeat(64),
      logSha256: "EF".repeat(32),
      log: "[info] ZKey Ok!\n",
      verifierVersion: "0.1.0",
      snarkjsVersion: "0.7.6",
    };
    expect(validateReport(valid)).toMatchObject({
      contributionHash: "ab".repeat(64),
      logSha256: "ef".repeat(32),
    });
    expect(() => validateReport({ ...valid, zkeyName: "" })).toThrow(/report\.zkeyName/);
    expect(() => validateReport({ ...valid, log: "\u001b[31m" })).toThrow(/report\.log/);
    expect(() => validateReport({ ...valid, job: { ...job, index: undefined } })).toThrow(
      /report\.job/,
    );
  });

  it("accepts only known rejection reasons", () => {
    expect(
      validateReport({ job, result: "rejected", reason: "stale-head", detail: "x" }),
    ).toMatchObject({ detail: "x" });
    expect(() => validateReport({ job, result: "rejected", reason: "made-up" })).toThrow(
      /report\.reason/,
    );
  });

  it("checks a job spec's head entries and that its index follows them", () => {
    const spec = {
      job: { ...job, index: 2 },
      claim: {
        inputSha256: "aa".repeat(32),
        outputSha256: "bb".repeat(32),
        contributionHash: "cc".repeat(64),
        method: "cli",
        client: { name: "c", version: "1", commit: "abc1234" },
      },
      size: 100,
      head: {
        outputSha256: "dd".repeat(32),
        csHash: "ee".repeat(64),
        previous: [{ hash: "ff".repeat(64), name: "alice", deltaAfter: "11".repeat(64) }],
      },
      genesisSha256: "dd".repeat(32),
    };
    expect(validateJobSpec(spec).job.index).toBe(2);
    expect(() => validateJobSpec({ ...spec, job })).toThrow(/does not follow the head/);
    expect(() =>
      validateJobSpec({
        ...spec,
        head: { ...spec.head, previous: [{ ...spec.head.previous[0], name: "a\nb" }] },
      }),
    ).toThrow(/previous\[0\]\.name/);
    expect(() => validateJobSpec({ ...spec, size: 0 })).toThrow(/spec\.size/);
  });
});

describe("jobs", () => {
  const spec = {
    job: { seq: 3, circuit: "shield" as const, attempt: 2, index: 1 },
    claim: {
      inputSha256: "aa".repeat(32),
      outputSha256: "bb".repeat(32),
      contributionHash: "cc".repeat(64),
      method: "cli" as const,
      client: { name: "c", version: "1", commit: "abc1234" },
    },
    size: 100,
    head: { outputSha256: "aa".repeat(32), csHash: "ee".repeat(64), previous: [] },
    genesisSha256: "aa".repeat(32),
  };
  const log = "[info] ZKey Ok!\n";

  it("names jobs and their private objects", () => {
    expect(jobKey(spec.job)).toBe("3/shield/2");
    expect(jobObjectPrefix(spec.job)).toBe("verify/3/shield/2-");
  });

  it("reports a verdict and reconciles it with the job", () => {
    const report = reportOf(
      spec,
      { result: "valid", index: 1, contributionHash: "cc".repeat(64) },
      { name: "alice", deltaAfter: "dd".repeat(64) },
      log,
      "0.1.0",
    );
    expect(validateReport(report)).toEqual(report);
    const job = { index: 1, claim: spec.claim };
    expect(reconcileReport(job, report)).toBe("valid");
    expect(reconcileReport({ ...job, index: 2 }, report)).toBe("infra");
    expect(
      reconcileReport(job, { ...report, contributionHash: "ff".repeat(64) } as typeof report),
    ).toBe("infra");
    expect(reconcileReport(job, { ...report, log: "other" } as typeof report)).toBe("infra");
    expect(reconcileReport(job, { job: spec.job, result: "ambiguous", detail: "x" })).toBe(
      "ambiguous",
    );
  });

  it("turns an accepted job into a valid transcript record", () => {
    const report = reportOf(
      spec,
      { result: "valid", index: 1, contributionHash: "cc".repeat(64) },
      { name: "alice", deltaAfter: "dd".repeat(64) },
      log,
      "0.1.0",
    );
    if (report.result !== "valid") throw new Error("expected valid");
    const record = buildContributionRecord(
      contributionInputOf({
        ceremonyId: "c-1",
        job: { ...spec.job, claim: spec.claim },
        report,
        contributor: null,
        at: "2026-10-01T00:00:00.000Z",
      }),
    );
    expect(record).toMatchObject({
      seq: 3,
      index: 1,
      zkey_name: "alice",
      identity: null,
      link_sig: null,
    });
  });
});
