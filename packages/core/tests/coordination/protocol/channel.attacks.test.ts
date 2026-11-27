/**
 * Attacks the coordinator ↔ verifier wire contract: HMAC canonical form and bounds, the job spec
 * and report validators, `reconcileReport`, and report contents. The wire refuses the CLI's local
 * verifier marker: a record marked simulated would fail every later integrity check on mainnet and
 * withhold the transcript.
 */
import { describe, expect, it } from "vitest";
import { MAX_CONTRIBUTIONS, MAX_JOB_SPEC_BYTES, REQUEST_AUTH } from "../../../src/config";
import {
  authHeadersWellFormed,
  BODY_SHA256_HEADER,
  checkHmacKey,
  reconcileReport,
  reportOf,
  SIGNATURE_HEADER,
  signRequest,
  TIMESTAMP_HEADER,
  validateJobSpec,
  validateReport,
  verifyRequest,
} from "../../../src/coordination/protocol";
import { utf8 } from "../../../src/primitives/encoding";
import { hmacSha256Hex, sha256Utf8 } from "../../../src/primitives/hashing";

const KEY = "a-shared-key-of-at-least-32-bytes";
const CID = "wire-1";
const NOW = 1_800_000_000_000;

const sign = (method = "POST", path = "/verify", body = "{}", now = NOW, cid = CID, key = KEY) =>
  signRequest(key, cid, method, path, body, now);
const hdr = (s: Record<string, string>) => ({
  timestamp: s[TIMESTAMP_HEADER],
  signature: s[SIGNATURE_HEADER],
  bodySha256: s[BODY_SHA256_HEADER],
});
const SIGNED = sign();
const verifyAt = (now: number) =>
  verifyRequest(KEY, CID, "POST", "/verify", "{}", hdr(SIGNED), now);
const thrown = (f: () => unknown): string => {
  try {
    f();
  } catch (e) {
    return (e as Error).message;
  }
  return "";
};
const sparse = (n: number): unknown[] => {
  const a: unknown[] = [];
  a.length = n;
  return a;
};

describe("HMAC timestamp bounds and shapes", () => {
  it("accepts exactly ±skew and refuses one ms beyond, both directions", () => {
    expect(verifyAt(NOW + REQUEST_AUTH.skewMs)).toBe(true);
    expect(verifyAt(NOW - REQUEST_AUTH.skewMs)).toBe(true);
    expect(verifyAt(NOW + REQUEST_AUTH.skewMs + 1)).toBe(false);
    expect(verifyAt(NOW - REQUEST_AUTH.skewMs - 1)).toBe(false);
  });

  it.each([
    ["plus sign", `+${NOW}`],
    ["minus sign", `-${NOW}`],
    ["decimal", `${NOW}.0`],
    ["exponent", "1.8e12"],
    ["leading space", ` ${NOW}`],
    ["trailing newline", `${NOW}\n`],
    ["17 digits", `0${"1".repeat(16)}`],
    ["empty", ""],
    ["hex", "0x1a3185c5000"],
    ["unicode digits", "١٨٠٠٠٠٠٠٠٠٠٠٠"],
  ])("refuses a timestamp with a %s by shape", (_, ts) => {
    expect(authHeadersWellFormed({ ...hdr(SIGNED), timestamp: ts })).toBe(false);
    expect(
      verifyRequest(KEY, CID, "POST", "/verify", "{}", { ...hdr(SIGNED), timestamp: ts }, NOW),
    ).toBe(false);
  });

  it("refuses a zero-padded spelling of the signed timestamp", () => {
    const padded = `000${NOW}`;
    expect(authHeadersWellFormed({ ...hdr(SIGNED), timestamp: padded })).toBe(true);
    expect(
      verifyRequest(KEY, CID, "POST", "/verify", "{}", { ...hdr(SIGNED), timestamp: padded }, NOW),
    ).toBe(false);
  });

  it("refuses a 16-digit timestamp beyond 2^53 at the skew check", () => {
    const ts = "9".repeat(16);
    const digest = sha256Utf8("{}");
    const mac = hmacSha256Hex(utf8(KEY), `dispatch\n${CID}\n${ts}\nPOST\n/verify\n${digest}`);
    const forged = { timestamp: ts, signature: mac, bodySha256: digest };
    expect(verifyRequest(KEY, CID, "POST", "/verify", "{}", forged, NOW)).toBe(false);
  });

  it.each([
    ["uppercase hex", (m: string) => m.toUpperCase()],
    ["63 chars", (m: string) => m.slice(1)],
    ["65 chars", (m: string) => `${m}0`],
    ["0x prefix", (m: string) => `0x${m.slice(2)}`],
    ["base64", (m: string) => Buffer.from(m, "hex").toString("base64")],
  ])("refuses a signature as %s", (_, f) => {
    const sig = f(SIGNED[SIGNATURE_HEADER] as string);
    expect(
      verifyRequest(KEY, CID, "POST", "/verify", "{}", { ...hdr(SIGNED), signature: sig }, NOW),
    ).toBe(false);
  });
});

describe("HMAC direction", () => {
  it("signs only the verifier's route and the coordinator's /internal, each under its own tag", () => {
    for (const path of [
      "/",
      "/api/status",
      "/admin/state",
      "/verify/",
      "/internalx",
      "/x/internal/",
    ]) {
      expect(() => signRequest(KEY, CID, "POST", path, "{}", NOW)).toThrow(/are required/);
      expect(verifyRequest(KEY, CID, "POST", path, "{}", hdr(SIGNED), NOW)).toBe(false);
    }
    const untagged = hmacSha256Hex(utf8(KEY), `${CID}\n${NOW}\nPOST\n/verify\n${sha256Utf8("{}")}`);
    expect(
      verifyRequest(
        KEY,
        CID,
        "POST",
        "/verify",
        "{}",
        { ...hdr(SIGNED), signature: untagged },
        NOW,
      ),
    ).toBe(false);
  });
});

describe("HMAC canonical form", () => {
  it("refuses to sign a field with an embedded newline, so no field can shift", () => {
    for (const [cid, method, path] of [
      [`${CID}\n1`, "POST", "/verify"],
      [CID, "POST\n/verify", "/x"],
      [CID, "POST", "/verify\n{}"],
    ] as const) {
      expect(() => signRequest(KEY, cid, method, path, "", NOW)).toThrow(
        /without a newline, are required/,
      );
    }
    const s = sign("POST", "/internal/a", "b\nc");
    expect(verifyRequest(KEY, CID, "POST", "/internal/a\nb", "c", hdr(s), NOW)).toBe(false);
  });

  it("does not treat a carriage return as a separator or alias another request", () => {
    const s = sign("POST", "/internal/verifications\r", "{}");
    expect(verifyRequest(KEY, CID, "POST", "/internal/verifications", "{}", hdr(s), NOW)).toBe(
      false,
    );
  });

  it.each([
    ["%2F-encoded", "/internal/objects/1%2Fshield%2F1"],
    ["lowercase %2f", "/internal/objects/1%2fshield%2f1"],
    ["trailing slash", "/internal/objects/1/shield/1/"],
    ["double slash", "/internal//objects/1/shield/1"],
    ["dot segment", "/internal/objects/1/shield/../shield/1"],
    ["query", "/internal/objects/1/shield/1?x=1"],
    ["fragment", "/internal/objects/1/shield/1#x"],
    ["percent-encoded letter", "/internal/objects/1/sh%69eld/1"],
    ["NFD vs NFC (no normalization)", "/internal/objects/1/shiéld/1"],
    ["leading zero", "/internal/objects/01/shield/1"],
  ])("refuses a MAC for the canonical object path under its %s spelling", (_, other) => {
    const s = sign("GET", "/internal/objects/1/shield/1", "");
    expect(verifyRequest(KEY, CID, "GET", other, "", hdr(s), NOW)).toBe(false);
  });

  it("refuses to carry a request across directions under the shared key", () => {
    const body = "{}";
    const dispatch = sign("POST", "/verify", body);
    expect(
      verifyRequest(KEY, CID, "POST", "/internal/verifications", body, hdr(dispatch), NOW),
    ).toBe(false);
    const report = sign("POST", "/internal/verifications", body);
    expect(verifyRequest(KEY, CID, "POST", "/verify", body, hdr(report), NOW)).toBe(false);
  });

  it("refuses a MAC for another ceremony id under the same key", () => {
    const s = sign("POST", "/verify", "{}", NOW, "wire-2");
    expect(verifyRequest(KEY, CID, "POST", "/verify", "{}", hdr(s), NOW)).toBe(false);
  });

  it("refuses a key under 32 bytes on both sides, without echoing it", () => {
    const short = "s3cr3t-short-key";
    for (const f of [
      () => checkHmacKey(short),
      () => signRequest(short, CID, "POST", "/verify", "", NOW),
      () => verifyRequest(short, CID, "POST", "/verify", "", hdr(sign()), NOW),
    ]) {
      expect(thrown(f)).toMatch(/at least 32 bytes/);
      expect(thrown(f)).not.toContain(short);
    }
    expect(() => checkHmacKey("k".repeat(31))).toThrow(/at least 32 bytes/);
    expect(() => checkHmacKey("€".repeat(11))).not.toThrow();
  });

  it("encodes lone surrogates in a key as U+FFFD, so two such key strings share one MAC key", () => {
    const a = `${"k".repeat(30)}\ud800`;
    const b = `${"k".repeat(30)}\udfff`;
    const sa = signRequest(a, CID, "POST", "/verify", "{}", NOW);
    expect(verifyRequest(b, CID, "POST", "/verify", "{}", hdr(sa), NOW)).toBe(true);
  });
});

const CLIENT = { name: "cli", version: "0.1.0", commit: "abc1234" };
const claim = {
  inputSha256: "11".repeat(32),
  outputSha256: "22".repeat(32),
  contributionHash: "33".repeat(64),
  method: "cli",
  client: CLIENT,
};
const entry = (i: number) => ({
  hash: (i % 256).toString(16).padStart(2, "0").repeat(64),
  name: '"\\'.repeat(32),
  deltaAfter: "44".repeat(64),
});
const spec = (previous: unknown[], index = previous.length + 1): unknown => ({
  job: { seq: 1, circuit: "shield", attempt: 1, index },
  claim,
  size: 100,
  head: { outputSha256: "11".repeat(32), csHash: "55".repeat(64), previous },
  genesisSha256: "66".repeat(32),
});

describe("job spec bounds", () => {
  it("takes MAX_CONTRIBUTIONS worst-case entries within MAX_JOB_SPEC_BYTES, refuses one more", () => {
    const full = Array.from({ length: MAX_CONTRIBUTIONS }, (_, i) => entry(i));
    const text = JSON.stringify(spec(full));
    expect(utf8(text).length).toBeLessThanOrEqual(MAX_JOB_SPEC_BYTES);
    expect(validateJobSpec(JSON.parse(text)).job.index).toBe(MAX_CONTRIBUTIONS + 1);
    expect(() => validateJobSpec(spec([...full, entry(0)]))).toThrow(/more than/);
  });

  it.each([
    ["an index that does not follow the head", spec([entry(1)], 3), /does not follow the head/],
    ["index 0", spec([], 0), /spec\.job\.index: expected an integer/],
    ["a sparse previous", spec(sparse(2), 3), /previous\[0\]: missing item/],
    [
      "an uppercase csHash",
      {
        ...(spec([]) as object),
        head: { outputSha256: "11".repeat(32), csHash: "AA".repeat(64), previous: [] },
      },
      /csHash: expected 64-byte lowercase hex/,
    ],
    [
      "a short csHash",
      {
        ...(spec([]) as object),
        head: { outputSha256: "11".repeat(32), csHash: "aa".repeat(63), previous: [] },
      },
      /csHash: expected 64-byte lowercase hex/,
    ],
    ["size 0", { ...(spec([]) as object), size: 0 }, /spec\.size: expected an integer/],
    [
      "size above MAX_FILE_BYTES",
      { ...(spec([]) as object), size: 128 * 1024 * 1024 + 1 },
      /spec\.size: expected an integer/,
    ],
    [
      "a fractional size",
      { ...(spec([]) as object), size: 1.5 },
      /spec\.size: expected an integer/,
    ],
    [
      "an extra top-level field",
      { ...(spec([]) as object), url: "https://evil" },
      /spec: unexpected field "url"/,
    ],
    [
      "an extra head field",
      {
        ...(spec([]) as object),
        head: { outputSha256: "11".repeat(32), csHash: "55".repeat(64), previous: [], url: "x" },
      },
      /spec\.head: unexpected field "url"/,
    ],
    [
      "a prototype key",
      JSON.parse(`{"__proto__":{"x":1},${JSON.stringify(spec([])).slice(1)}`),
      /unexpected field "__proto__"/,
    ],
    [
      "a non-printable entry name",
      spec([{ ...entry(0), name: "a\u0000b" }]),
      /previous\[0\]\.name: does not match/,
    ],
    [
      "an empty entry name",
      spec([{ ...entry(0), name: "" }]),
      /previous\[0\]\.name: does not match/,
    ],
    [
      "a seq of 2^32",
      { ...(spec([]) as object), job: { seq: 2 ** 32, circuit: "shield", attempt: 1, index: 1 } },
      /spec\.job\.seq: expected an integer/,
    ],
    [
      "a circuit name that is not well formed",
      { ...(spec([]) as object), job: { seq: 1, circuit: "../x", attempt: 1, index: 1 } },
      /spec\.job\.circuit: does not match/,
    ],
  ])("refuses %s", (_, value, message) => {
    expect(() => validateJobSpec(value)).toThrow(message);
  });
});

const job = { seq: 1, circuit: "shield" as const, attempt: 7, index: 3 };
const LOG = "[info] ZKey Ok!\n";
const valid = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  job,
  result: "valid",
  contributionHash: claim.contributionHash,
  zkeyName: "alice",
  deltaAfter: "cd".repeat(64),
  logSha256: sha256Utf8(LOG),
  log: LOG,
  verifierVersion: "0.1.0",
  snarkjsVersion: "0.7.6",
  ...over,
});

describe("reconcileReport never turns a contradiction into an acceptance", () => {
  const theJob = { index: 3, claim: { contributionHash: claim.contributionHash } };
  it.each([
    ["another index", { job: { ...job, index: 4 } }],
    ["another h_k", { contributionHash: "34".repeat(64) }],
    ["a log that is not the hashed one", { log: `${LOG}x` }],
    ["a log hash of another log", { logSha256: sha256Utf8("other") }],
  ])("treats a valid report with %s as infra", (_, over) => {
    expect(reconcileReport(theJob, validateReport(valid(over)))).toBe("infra");
  });

  it("treats a rejected or ambiguous report for another index as infra, never a penalty", () => {
    const r = validateReport({
      job: { ...job, index: 9 },
      result: "rejected",
      reason: "malformed",
    });
    expect(reconcileReport(theJob, r)).toBe("infra");
    const a = validateReport({ job: { ...job, index: 9 }, result: "ambiguous", detail: "x" });
    expect(reconcileReport(theJob, a)).toBe("infra");
  });

  it("normalizes an uppercase h_k and matches it to the job", () => {
    const r = validateReport(valid({ contributionHash: claim.contributionHash.toUpperCase() }));
    expect(reconcileReport(theJob, r)).toBe("valid");
  });

  it.each([
    ["a NUL in the log", { log: "a\u0000b", logSha256: sha256Utf8("a\u0000b") }, /report\.log: /],
    [
      "an ANSI escape in the log",
      { log: "\u001b[2J", logSha256: sha256Utf8("\u001b[2J") },
      /report\.log: /,
    ],
    ["a CR in the log", { log: "a\rb", logSha256: sha256Utf8("a\rb") }, /report\.log: /],
    ["an empty zkeyName", { zkeyName: "" }, /report\.zkeyName: /],
    ["a 65-char zkeyName", { zkeyName: "a".repeat(65) }, /report\.zkeyName: longer than 64/],
    [
      "an uppercase deltaAfter",
      { deltaAfter: "CD".repeat(64) },
      /report\.deltaAfter: expected 64-byte lowercase hex/,
    ],
    [
      "a 33-char verifierVersion",
      { verifierVersion: "1".repeat(33) },
      /report\.verifierVersion: longer than 32/,
    ],
    ["a newline in verifierVersion", { verifierVersion: "0.1.0\n" }, /report\.verifierVersion: /],
    [
      "a 17-char snarkjsVersion",
      { snarkjsVersion: "0.7.6-xxxxxxxxxxx" },
      /report\.snarkjsVersion: expected one of/,
    ],
    ["a valid with a detail", { detail: "x" }, /report: unexpected field "detail"/],
    ["a valid with a reason", { reason: "malformed" }, /report: unexpected field "reason"/],
  ])("validateReport refuses %s", (_, over, message) => {
    expect(() => validateReport(valid(over))).toThrow(message);
  });

  it("refuses a detail with control characters and an infra without a detail", () => {
    expect(() => validateReport({ job, result: "infra", detail: "a\nb" })).toThrow(
      /report\.detail: does not match/,
    );
    expect(() => validateReport({ job, result: "infra" })).toThrow(
      /report: missing field "detail"/,
    );
    expect(() => validateReport({ job, result: "infra", detail: "x".repeat(1001) })).toThrow(
      /report\.detail: longer than 1000/,
    );
  });
});

describe("what leaves the verifier in a report", () => {
  const theSpec = validateJobSpec(spec([entry(1), entry(2)]));
  const STDERR = "FATAL /home/op/secret VERIFIER_HMAC_KEY=deadbeef";
  it("never carries the raw log (a crashed child's stderr) in an infra or rejected report", () => {
    for (const verdict of [
      { result: "infra" as const, detail: "exited (1) without an answer" },
      { result: "rejected" as const, reason: "malformed" as const, detail: "snarkjs: bad" },
    ]) {
      const r = reportOf(theSpec, verdict, undefined, STDERR, "0.1.0");
      expect(JSON.stringify(r)).not.toContain("deadbeef");
    }
  });

  it("makes free text printable and bounded before it is sent", () => {
    const r = reportOf(
      theSpec,
      { result: "infra", detail: `a\u001b[2J\nb${"x".repeat(5000)}` },
      undefined,
      "",
      "0.1.0",
    );
    expect(() => validateReport(JSON.parse(JSON.stringify(r)))).not.toThrow();
  });
});

describe("version strings a report carries into the transcript", () => {
  it("refuses a valid report claiming verifierVersion 'cli-local'", () => {
    expect(() => validateReport(valid({ verifierVersion: "cli-local" }))).toThrow(
      /report\.verifierVersion: the local marker/,
    );
  });

  it("refuses a snarkjs version other than the pinned one", () => {
    expect(() => validateReport(valid({ snarkjsVersion: "9.9.9" }))).toThrow(
      /report\.snarkjsVersion: expected one of/,
    );
  });
});
