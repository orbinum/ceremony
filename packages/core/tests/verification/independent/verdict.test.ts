/** The independent Rust verifier's verdict, read strictly. SPEC §8.4. */
import { describe, expect, it } from "vitest";
import {
  compareIndependent,
  readIndependentVerdict,
  REQUIRED_CHECKS,
} from "../../../src/verification/independent";

const HASH = "ab".repeat(64);
const verdict = (patch: Record<string, unknown> = {}) => ({
  verifier: "ceremony-verifier 0.1.0",
  ok: true,
  checks: REQUIRED_CHECKS.map((id) => ({ id, ok: true })),
  cs_hash: HASH,
  entries: [
    { index: 1, kind: "contribution", hash: HASH },
    { index: 2, kind: "beacon", hash: HASH },
  ],
  ...patch,
});

describe("the independent verifier's verdict (SPEC §8.4)", () => {
  it("reads a passing verdict", () => {
    expect(readIndependentVerdict(verdict(), true)).toEqual({
      ok: true,
      failures: [],
      csHash: HASH,
      entries: [
        { kind: "contribution", hash: HASH },
        { kind: "beacon", hash: HASH },
      ],
    });
  });

  it("reports failing checks with their detail", () => {
    const checks = REQUIRED_CHECKS.map((id) => ({
      id,
      ok: id !== "chain",
      ...(id === "chain" ? { detail: "broken" } : {}),
    }));
    expect(readIndependentVerdict(verdict({ ok: false, checks }), false).failures).toEqual([
      "chain: broken",
    ]);
  });

  it.each([
    [
      "a missing check",
      { checks: REQUIRED_CHECKS.slice(1).map((id) => ({ id, ok: true })) },
      /checks \[/,
    ],
    [
      "an extra check",
      { checks: [...REQUIRED_CHECKS, "extra"].map((id) => ({ id, ok: true })) },
      /checks \[/,
    ],
    ["another program", { verifier: "other 9.9.9" }, /not a ceremony-verifier verdict/],
    ["an old release", { verifier: "ceremony-verifier 0.0.9" }, /older than 0\.1\.0/],
    ["an unreadable version", { verifier: "ceremony-verifier 1.x" }, /unreadable version/],
    [
      "entries out of order",
      { entries: [{ index: 2, kind: "beacon", hash: HASH }] },
      /entries\[0\]\.index/,
    ],
    ["a non-object", { checks: [null] }, /checks\[0\]: expected an object/],
  ])("refuses %s", (_, patch, message) => {
    expect(() => readIndependentVerdict(verdict(patch), true)).toThrow(message);
  });

  it("refuses an exit code that disagrees with the verdict", () => {
    expect(() => readIndependentVerdict(verdict(), false)).toThrow(
      /exit code and verdict disagree/,
    );
  });

  it("accepts newer releases", () => {
    expect(readIndependentVerdict(verdict({ verifier: "ceremony-verifier 0.2.0" }), true).ok).toBe(
      true,
    );
    expect(readIndependentVerdict(verdict({ verifier: "ceremony-verifier 1.0.0" }), true).ok).toBe(
      true,
    );
  });

  it("compares the verdict's chain and csHash with the transcript", () => {
    const v = readIndependentVerdict(verdict(), true);
    expect(compareIndependent(v, [HASH], HASH)).toEqual([]);
    expect(compareIndependent(v, [HASH, HASH], HASH)).toEqual([
      "its h_k chain differs from the transcript",
    ]);
    expect(compareIndependent(v, [HASH], "cd".repeat(64))).toEqual([
      "its csHash differs from init.json",
    ]);
  });
});

describe("the verdict, read strictly", () => {
  it("counts the top-level ok: a verdict that says it failed, exiting non-zero, is a failure", () => {
    expect(readIndependentVerdict(verdict({ ok: false }), false).ok).toBe(false);
    expect(() => readIndependentVerdict(verdict({ ok: false }), true)).toThrow(
      "verdict: exit code and verdict disagree",
    );
  });

  it("refuses a verifier id with trailing tokens", () => {
    expect(() =>
      readIndependentVerdict(verdict({ verifier: "ceremony-verifier 0.1.0 patched" }), true),
    ).toThrow("verdict: not a ceremony-verifier verdict");
  });

  it("refuses a check reported twice, even the last one", () => {
    const last = [...REQUIRED_CHECKS].toSorted().at(-1) as string;
    const checks = [...REQUIRED_CHECKS.map((id) => ({ id, ok: true })), { id: last, ok: true }];
    expect(() => readIndependentVerdict(verdict({ checks }), true)).toThrow(/verdict: checks \[/);
  });
});
