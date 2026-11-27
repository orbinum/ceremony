/**
 * One job end to end (hermetic harness, pairing check stubbed) against leaks and swapped inputs:
 * secrets, stderr and paths stay out of reports, descriptors do not leak, swapped staged copies
 * are infra.
 */
import { readdirSync } from "node:fs";
import { rm, symlink } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { IsolationError } from "../../../src/isolate";
import { loadInputs } from "../../../src/service";
import { contribute, verifyFromInit } from "../../../src/snarkjs";
import { REPLY_CHECKS } from "../../../src/snarkjs/worker";
import { HMAC_KEY, type JobHarness, jobHarness } from "../../support";

vi.mock("@orbinum-ceremony/core", async (actual) => {
  const { withFakePtau } = await import("../../support/fake-ptau");
  return withFakePtau(await actual());
});
vi.mock("../../../src/snarkjs", async (actual) => ({
  ...(await actual<typeof import("../../../src/snarkjs")>()),
  verifyFromInit: vi.fn<typeof verifyFromInit>(),
}));
const zkvi = vi.mocked(verifyFromInit);
const OK = { ok: true, log: "[info] ZKey Ok!" };

let h: JobHarness;
let honest = "";
let honestHash = "";
const openFds = () => readdirSync("/dev/fd").length;

beforeAll(async () => {
  h = await jobHarness();
  honest = join(h.dir, "honest.zkey");
  honestHash = await contribute(h.inputs.genesis.shield?.path as string, honest, "alice", "e1");
}, 60_000);
afterAll(() => h.stop());
beforeEach(() => {
  zkvi.mockReset().mockResolvedValue(OK);
});

describe("what a job's report never carries", () => {
  it("keeps a crashed child's stderr (with secrets) in the host record, out of the report", async () => {
    const stderr = `panic at ${h.dir}/x VERIFIER_HMAC_KEY=${HMAC_KEY}`;
    zkvi.mockRejectedValue(new IsolationError("crashed", "exited (1) without an answer", stderr));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { report, record } = await h.run(honest, { contributionHash: honestHash });
      expect(report).toMatchObject({ result: "infra", detail: "exited (1) without an answer" });
      expect(JSON.stringify(report)).not.toContain(HMAC_KEY);
      expect(JSON.stringify(report)).not.toContain("panic");
      expect(await record()).toContain("panic");
    } finally {
      error.mockRestore();
    }
  });

  it("keeps the key and the operator's paths out of a rejected detail", async () => {
    zkvi.mockRejectedValue(new Error(`Invalid zkey ${h.dir}/genesis ${process.cwd()}/x`));
    const { report } = await h.run(honest, { contributionHash: honestHash });
    expect(report).toMatchObject({ result: "rejected", reason: "malformed" });
    const text = JSON.stringify(report);
    expect(text).not.toContain(h.dir);
    expect(text).not.toContain(process.cwd());
    expect(text).not.toContain(HMAC_KEY);
  });

  it("takes a valid report's index from the bytes and the job's other ids from the spec", async () => {
    const { spec, report } = await h.run(honest, { contributionHash: honestHash });
    expect(report).toMatchObject({ result: "valid", job: { ...spec.job, index: 1 } });
  });
});

describe("descriptors across many jobs", () => {
  it("leaves no descriptor open after 40 jobs of every outcome", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await h.run(honest, { contributionHash: honestHash });
      const before = openFds();
      for (let i = 0; i < 10; i++) {
        zkvi.mockResolvedValueOnce(OK);
        await h.run(honest, { contributionHash: honestHash });
        zkvi.mockResolvedValueOnce({ ok: false, log: "bad" });
        await h.run(honest, { contributionHash: honestHash });
        zkvi.mockRejectedValueOnce(new IsolationError("timeout", "timed out"));
        await h.run(honest, { contributionHash: honestHash });
        await h.run(undefined);
      }
      expect(openFds()).toBeLessThanOrEqual(before + 2);
    } finally {
      error.mockRestore();
      warn.mockRestore();
    }
  }, 120_000);
});

async function swapGenesis(make: (path: string) => Promise<void>) {
  const copy = h.inputs.genesis.shield?.path as string;
  await rm(copy, { force: true });
  await make(copy);
}

async function restoreInputs() {
  await h.inputs.stage.cleanup();
  h.inputs = await loadInputs(h.config);
}

describe("a staged copy swapped between jobs", () => {
  it("reports infra for a symlink in place of the staged genesis (to the right bytes), never following it", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await swapGenesis((p) => symlink(join(h.dir, "genesis", "shield.genesis.zkey"), p));
      const fetched = h.coordinator.fetches().length;
      const { report } = await h.run(honest, { contributionHash: honestHash });
      expect(report).toMatchObject({ result: "infra" });
      expect(h.coordinator.fetches()).toHaveLength(fetched);
      expect(h.inputs.pinned).toBe(false);
    } finally {
      error.mockRestore();
      await restoreInputs();
    }
  });

  it("reports infra for a FIFO in place of the staged genesis, without blocking", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await swapGenesis(async (p) => void execFileSync("mkfifo", [p]));
      const { report } = await h.run(honest, { contributionHash: honestHash });
      expect(report).toMatchObject({ result: "infra" });
    } finally {
      error.mockRestore();
      await restoreInputs();
    }
  }, 30_000);
});

describe("the child's reply is shape-checked, not judged", () => {
  it("refuses a verify reply {ok: true} without snarkjs's 'ZKey Ok!'", () => {
    expect(REPLY_CHECKS.verifyFromInit({ ok: true, log: "" })).toBe(false);
    expect(REPLY_CHECKS.verifyFromR1cs({ ok: true, log: "x".repeat(1024) })).toBe(false);
    expect(REPLY_CHECKS.verifyFromInit({ ok: true, log: "ZKey Ok!\n" })).toBe(true);
    expect(REPLY_CHECKS.verifyFromInit({ ok: false, log: "" })).toBe(true);
  });
});
