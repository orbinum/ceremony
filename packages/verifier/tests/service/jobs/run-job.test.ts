/**
 * One job, hermetic: the multiplier ceremony under a stand-in ptau pin, real pre-checks, and the
 * pairing check replaced so every verdict can be forced. Verdicts, reports, the attempt record,
 * the time the download leaves to verification and the report, and what never leaves the host
 * (the service's working directory included; the pipeline itself hides the temp dir and home).
 * TMPDIR is stubbed, not assigned, so an unset one (Linux CI) is unset again afterwards.
 */
import { chmod, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { verifierLogOf } from "@orbinum-ceremony/core";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createStage } from "../../../src/files";
import { JOB_DEADLINE_MS, loadInputs, runJob } from "../../../src/service";
import { contribute, verifyFromInit } from "../../../src/snarkjs";
import { type JobHarness, jobHarness, jobSpec } from "../../support";

vi.mock("@orbinum-ceremony/core", async (actual) => {
  const { withFakePtau } = await import("../../support/fake-ptau");
  return withFakePtau(await actual());
});
vi.mock("../../../src/snarkjs", async (actual) => ({
  ...(await actual<typeof import("../../../src/snarkjs")>()),
  verifyFromInit: vi.fn<typeof verifyFromInit>(),
}));
vi.mock("../../../src/files", async (actual) => {
  const files = await actual<typeof import("../../../src/files")>();
  return { ...files, createStage: vi.fn<typeof files.createStage>(files.createStage) };
});
const zkvi = vi.mocked(verifyFromInit);
const OK = { ok: true, log: "[info] ZKey Ok!" };

let h: JobHarness;
let honest = "";
let honestHash = "";

beforeAll(async () => {
  h = await jobHarness();
  honest = join(h.dir, "honest.zkey");
  honestHash = await contribute(h.inputs.genesis.shield?.path as string, honest, "alice", "e1");
}, 60_000);
afterAll(() => h.stop());
beforeEach(() => {
  zkvi.mockReset().mockResolvedValue(OK);
});

describe("run job: verdicts and reports", () => {
  it("accepts an honest upload; its record holds the reported log and the delivery", async () => {
    const { spec, report, record } = await h.run(honest, { contributionHash: honestHash });
    expect(report).toMatchObject({
      job: { seq: 1, circuit: "shield", index: 1 },
      result: "valid",
      contributionHash: honestHash,
      zkeyName: "alice",
      log: OK.log,
      verifierVersion: h.config.version,
      snarkjsVersion: "0.7.6",
    });
    const onDisk = await record();
    const head = JSON.parse(onDisk.slice(0, onDisk.indexOf("\n"))) as {
      verdict: never;
      ms: Record<string, number>;
    };
    expect(onDisk).toBe(
      `${verifierLogOf(spec.job, head.verdict, head.ms, OK.log)}[report] posted\n`,
    );
    expect(head.verdict).toMatchObject({ result: "valid", contributionHash: honestHash });
  });

  it("rejects a claim the bytes do not carry, and one built on another head", async () => {
    expect((await h.run(honest, { contributionHash: "00".repeat(64) })).report).toMatchObject({
      result: "rejected",
      reason: "client-hash-mismatch",
    });
    const stale = await h.run(honest, {
      contributionHash: honestHash,
      inputSha256: "11".repeat(32),
    });
    expect(stale.report).toMatchObject({ result: "rejected", reason: "stale-head" });
    expect(zkvi).not.toHaveBeenCalled();
  });

  it("rejects what the pairing check refuses, with the log kept on the host only", async () => {
    zkvi.mockResolvedValue({ ok: false, log: "[error] delta mismatch" });
    const { report, record } = await h.run(honest, { contributionHash: honestHash });
    expect(report).toEqual({
      job: expect.objectContaining({ attempt: expect.any(Number) }),
      result: "rejected",
      reason: "zkey-verify-failed",
    });
    expect(await record()).toContain("[error] delta mismatch");
  });

  it("keeps the operator's paths out of a pipeline verdict", async () => {
    zkvi.mockRejectedValue(new Error(`Invalid zkey ${process.cwd()}/build/x.zkey`));
    const { report } = await h.run(honest, { contributionHash: honestHash });
    expect(report).toMatchObject({
      result: "rejected",
      reason: "malformed",
      detail: "snarkjs: Invalid zkey ./build/x.zkey",
    });
    expect(JSON.stringify(report)).not.toContain(process.cwd());
  });

  it("reports nothing and records nothing for a job whose object is gone", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { spec, report, record } = await h.run(undefined);
      expect(report).toBeUndefined();
      await expect(record()).rejects.toThrow("ENOENT");
      expect(warn).toHaveBeenCalledWith(
        `job 1/shield/${spec.job.attempt}: the coordinator has no object (stale job, or a wrong URL)`,
      );
    } finally {
      warn.mockRestore();
    }
  });

  it("records a report the coordinator refused", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    h.coordinator.refuseReports = true;
    try {
      const { report, record } = await h.run(honest, { contributionHash: honestHash });
      expect(report).toBeUndefined();
      expect(await record()).toMatch(
        /\[report\] not delivered: report: the coordinator answered 409 \{"error":"stale"\}\n$/,
      );
    } finally {
      h.coordinator.refuseReports = false;
      error.mockRestore();
    }
  });
});

describe("run job: bounds", () => {
  it("gives snarkjs the configured bound when the deadline is far", async () => {
    await h.run(honest, { contributionHash: honestHash });
    expect(zkvi.mock.calls[0]?.[3]).toEqual({ timeoutMs: h.config.timeoutMs });
  });

  it("lowers snarkjs's bound to what the deadline leaves, minus the report's share", async () => {
    const start = Date.now();
    let spent = 0;
    const now = vi.spyOn(Date, "now").mockImplementation(() => start + spent);
    h.coordinator.onObject = () => (spent = 200_000);
    try {
      await h.run(honest, { contributionHash: honestHash });
    } finally {
      h.coordinator.onObject = undefined;
      now.mockRestore();
    }
    expect(JOB_DEADLINE_MS).toBe(300_000);
    expect(zkvi.mock.calls[0]?.[3]).toEqual({ timeoutMs: 85_000 });
  });
});

async function inOwnTmp(fn: () => Promise<void>): Promise<string[]> {
  const tmp = join(h.dir, `tmp-${Math.random().toString(36).slice(2)}`);
  await mkdir(tmp);
  vi.stubEnv("TMPDIR", tmp);
  try {
    await fn();
    return await readdir(tmp);
  } finally {
    vi.unstubAllEnvs();
  }
}

describe("run job: our own side failing is infra, recorded, and leaves nothing behind", () => {
  it("removes its work directory and the upload's private copy", async () => {
    const left = await inOwnTmp(async () => {
      expect((await h.run(honest, { contributionHash: honestHash })).report).toMatchObject({
        result: "valid",
      });
    });
    expect(left).toEqual([]);
  });

  it("reports infra and records it when the host cannot make a work directory", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("TMPDIR", join(h.dir, "no-such-dir"));
    try {
      const { report, record } = await h.run(honest, { contributionHash: honestHash });
      expect(report).toMatchObject({ result: "infra", detail: expect.stringContaining("ENOENT") });
      const onDisk = await record();
      expect(JSON.parse(onDisk.slice(0, onDisk.indexOf("\n")))).toMatchObject({
        verdict: { result: "infra", detail: expect.stringContaining("ENOENT") },
      });
      expect(onDisk.endsWith("[report] posted\n")).toBe(true);
    } finally {
      vi.unstubAllEnvs();
      error.mockRestore();
    }
  });

  it("reports infra when copying its own download fails, whatever the error", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const actual = await vi.importActual<typeof import("../../../src/files")>("../../../src/files");
    vi.mocked(createStage).mockImplementationOnce(async (...args) => ({
      ...(await actual.createStage(...args)),
      copy: () =>
        Promise.reject(Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" })),
    }));
    try {
      const { report } = await h.run(honest, { contributionHash: honestHash });
      expect(report).toMatchObject({ result: "infra", detail: "EACCES: permission denied" });
    } finally {
      error.mockRestore();
    }
  });

  it("reports infra for a genesis it does not hold", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const spec = jobSpec(9_001, { ...h.genesis, sha256: "33".repeat(32) });
      const before = h.coordinator.reports.length;
      await runJob({ config: h.config, inputs: h.inputs }, spec);
      expect(h.coordinator.reports[before]).toEqual({
        job: spec.job,
        result: "infra",
        detail: `no pinned genesis ${"33".repeat(32)} for shield`,
      });
    } finally {
      error.mockRestore();
    }
  });

  it("reports infra without fetching when a staged copy no longer matches its pin", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const copy = h.inputs.ptau;
    await chmod(copy, 0o600);
    await writeFile(copy, "tampered");
    try {
      const fetched = h.coordinator.fetches().length;
      const { report, record } = await h.run(honest, { contributionHash: honestHash });
      expect(report).toMatchObject({
        result: "infra",
        detail: expect.stringMatching(/^ptau size 8/),
      });
      expect(h.coordinator.fetches()).toHaveLength(fetched);
      expect(h.inputs.pinned).toBe(false);
      expect(await record()).toContain('"result":"infra"');
    } finally {
      error.mockRestore();
      await h.inputs.stage.cleanup();
      h.inputs = await loadInputs(h.config);
    }
  });

  it("stages its inputs again when the host removed a copy, and the job still runs", async () => {
    await rm(h.inputs.ptau);
    const before = h.inputs.stage.dir;
    const { report } = await h.run(honest, { contributionHash: honestHash });
    expect(report).toMatchObject({ result: "valid" });
    expect(h.inputs.stage.dir).not.toBe(before);
    expect(h.inputs.pinned).toBe(true);
  });
});
