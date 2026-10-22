/**
 * The SPEC §2.5 pipeline when something fails, hermetic: who is at fault (our side is `infra`,
 * never the contributor's), what snarkjs' verdicts become, the cross-check from r1cs, and what
 * stays on the host (stderr, private copies).
 */
import { chmod, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { CurrentHead, UploadClaim } from "@orbinum-ceremony/core";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createStage } from "../../src/files";
import { IsolationError } from "../../src/isolate";
import { type UploadFiles, verifyUpload } from "../../src/pipeline";
import { verifyFromInit, verifyFromR1cs } from "../../src/snarkjs";
import {
  buildUploads,
  claimFor,
  MULTIPLIER_GENESIS,
  MULTIPLIER_R1CS,
  type Upload,
  type Uploads,
} from "../support";

vi.mock("../../src/snarkjs", async (actual) => ({
  ...(await actual<typeof import("../../src/snarkjs")>()),
  verifyFromInit: vi.fn<typeof verifyFromInit>(),
  verifyFromR1cs: vi.fn<typeof verifyFromR1cs>(),
}));
vi.mock("../../src/files", async (actual) => {
  const files = await actual<typeof import("../../src/files")>();
  return { ...files, createStage: vi.fn<typeof files.createStage>(files.createStage) };
});
const zkvi = vi.mocked(verifyFromInit);
const zkv = vi.mocked(verifyFromR1cs);
const stage = vi.mocked(createStage);
const OK = { ok: true, log: "[info] ZKey Ok!" };

let u: Uploads;
let ptau = "";

const verify = (
  up: Upload,
  head: CurrentHead = u.atGenesis,
  { files = {}, claim = {} }: { files?: Partial<UploadFiles>; claim?: Partial<UploadClaim> } = {},
) =>
  verifyUpload(
    { zkey: up.path, genesis: MULTIPLIER_GENESIS, ptau, ...files },
    { ...claimFor(up, head), ...claim },
    head,
  );

/** The cross-check on: zkvi and the full verify from r1cs must agree. */
const withR1cs = (up: Upload) => verify(up, u.atGenesis, { files: { r1cs: MULTIPLIER_R1CS } });

/** The next stage's copy fails with `error`, as the host's filesystem would make it. */
const nextCopyFails = (error: Error) =>
  stage.mockImplementationOnce(async (...args) => {
    const real = await (
      await vi.importActual<typeof import("../../src/files")>("../../src/files")
    ).createStage(...args);
    return { ...real, copy: () => Promise.reject(error) };
  });

const errno = (code: string) => Object.assign(new Error(`${code}: failed, copyfile`), { code });

beforeAll(async () => {
  u = await buildUploads();
  ptau = join(u.dir, "fake.ptau");
  await writeFile(ptau, "a pinned ptau, as far as the pipeline can tell");
}, 60_000);
afterAll(() => rm(u.dir, { recursive: true, force: true }));
beforeEach(() => {
  zkvi.mockReset().mockResolvedValue(OK);
  zkv.mockReset().mockResolvedValue(OK);
});

describe("our own side failing is infra, never the contributor's fault", () => {
  it("a genesis that is missing or unparseable", async () => {
    const missing = await verify(u.c1, u.atGenesis, {
      files: { genesis: join(u.dir, "nope.zkey") },
    });
    expect(missing.verdict).toEqual({
      result: "infra",
      detail: expect.stringMatching(
        /^ENOENT: no such file or directory, open '\$TMPDIR\/.*nope\.zkey'$/,
      ),
    });
    const garbage = join(u.dir, "garbage-genesis.zkey");
    await writeFile(garbage, "not a zkey");
    expect((await verify(u.c1, u.atGenesis, { files: { genesis: garbage } })).verdict).toEqual({
      result: "infra",
      detail: expect.stringMatching(/^bad magic /),
    });
  });

  it("a ptau or r1cs gone at the snarkjs step (checked before snarkjs reopens them)", async () => {
    // Were snarkjs to open the missing file itself, its ENOENT would read as the upload's fault.
    const enoent = Object.assign(new Error("ENOENT: no such file or directory"), {
      code: "ENOENT",
    });
    zkvi.mockRejectedValue(enoent);
    zkv.mockRejectedValue(enoent);
    const ptauDir = join(u.dir, "ptau-dir");
    await mkdir(ptauDir, { recursive: true });
    for (const [files, detail] of [
      [{ ptau: join(u.dir, "nope.ptau") }, /^ENOENT: .*nope\.ptau'$/],
      [{ ptau: ptauDir }, /^ptau-dir: not a regular file$/],
      [{ r1cs: join(u.dir, "nope.r1cs") }, /^ENOENT: .*nope\.r1cs'$/],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- one case at a time
      const res = await verify(u.c1, u.atGenesis, { files });
      expect(res.verdict).toEqual({ result: "infra", detail: expect.stringMatching(detail) });
      expect(res.ms.precheck).toBeGreaterThanOrEqual(0);
    }
    expect(zkvi).not.toHaveBeenCalled();
  });

  it("a private stage that cannot be created", async () => {
    const saved = process.env.TMPDIR;
    process.env.TMPDIR = join(u.dir, "no-such-tmp");
    try {
      expect((await verify(u.c1)).verdict).toEqual({
        result: "infra",
        detail: expect.stringMatching(/^ENOENT: .*mkdtemp/),
      });
    } finally {
      if (saved === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = saved;
    }
  });

  it.each(["ENOSPC", "EDQUOT", "EFBIG", "EROFS", "EIO"])(
    "copying the upload failing with %s",
    async (code) => {
      nextCopyFails(errno(code));
      expect((await verify(u.c1)).verdict).toEqual({
        result: "infra",
        detail: `${code}: failed, copyfile`,
      });
      expect(zkvi).not.toHaveBeenCalled();
    },
  );

  it("any failure copying our own download (the service's upload), whatever its code", async () => {
    for (const code of ["EACCES", "ENOENT", "EPERM"]) {
      nextCopyFails(errno(code));
      // oxlint-disable-next-line no-await-in-loop -- one case at a time
      const res = await verify(u.c1, u.atGenesis, { files: { zkeyIsOurs: true } });
      expect(res.verdict).toEqual({ result: "infra", detail: `${code}: failed, copyfile` });
    }
    // A file a user named (the cli) that cannot be read is that file's problem.
    nextCopyFails(errno("EACCES"));
    expect((await verify(u.c1)).verdict).toMatchObject({ result: "rejected", reason: "malformed" });
    expect(zkvi).not.toHaveBeenCalled();
  });

  it("an unreadable download of ours, for real", async () => {
    const path = join(u.dir, "unreadable.zkey");
    await writeFile(path, u.c1.bytes);
    await chmod(path, 0o000);
    const up = { ...u.c1, path };
    expect((await verify(up, u.atGenesis, { files: { zkeyIsOurs: true } })).verdict).toEqual({
      result: "infra",
      detail: expect.stringMatching(/^EACCES: /),
    });
    expect((await verify(up)).verdict).toMatchObject({ result: "rejected", reason: "malformed" });
  });

  it.each([
    [
      "an EMFILE code from the child",
      Object.assign(new Error("too many open files"), { code: "EMFILE" }),
    ],
    ["an ENOSPC message without a code", new Error("ENOSPC: no space left on device, write")],
    [
      "V8 unable to reserve wasm memory",
      new RangeError("WebAssembly.Memory(): could not allocate memory"),
    ],
    ["a time bound hit", new IsolationError("timeout", "timed out after 60 s")],
    ["a memory bound hit", new IsolationError("memory", "stopped above 2048 MB resident")],
    ["a crashed child", new IsolationError("crashed", "exited (SIGKILL) without an answer")],
  ])("zkvi failing with %s", async (_, error) => {
    zkvi.mockRejectedValue(error);
    const res = await verify(u.c1);
    expect(res.verdict).toEqual({ result: "infra", detail: error.message });
  });

  it("keeps a dead child's stderr in the log (on the host), out of the detail", async () => {
    const stderr = `Error [ERR_MODULE_NOT_FOUND] at file:///opt/verifier/node_modules/x.js`;
    zkvi.mockRejectedValue(new IsolationError("crashed", "exited (1) without an answer", stderr));
    const res = await verify(u.c1);
    expect(res.verdict).toEqual({ result: "infra", detail: "exited (1) without an answer" });
    expect(res.log).toBe(stderr);
  });

  it("leaves no private copy behind, whatever the verdict", async () => {
    const own = await mkdtemp(join(tmpdir(), "orbinum-verify-upload-tmp-"));
    // stubEnv, not an assignment: restoring an unset TMPDIR (Linux CI) must unset it again,
    // not set it to "undefined".
    vi.stubEnv("TMPDIR", own);
    try {
      await verify(u.c1);
      zkvi.mockRejectedValue(new IsolationError("timeout", "timed out"));
      await verify(u.c1);
      await verify(u.c1, u.atGenesis, { claim: { contributionHash: "00".repeat(64) } });
      expect(await readdir(own)).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
      await rm(own, { recursive: true, force: true });
    }
  });
});

describe("snarkjs judging the upload", () => {
  it("a failed zkvi rejects it, with the log", async () => {
    zkvi.mockResolvedValue({ ok: false, log: "[error] delta mismatch" });
    expect(await verify(u.c1)).toMatchObject({
      verdict: { result: "rejected", reason: "zkey-verify-failed" },
      log: "[error] delta mismatch",
    });
  });

  it("a zkvi throw on the file is malformed, its message redacted", async () => {
    zkvi.mockRejectedValue(new Error(`Invalid zkey ${homedir()}/x/upload.zkey`));
    expect((await verify(u.c1)).verdict).toEqual({
      result: "rejected",
      reason: "malformed",
      detail: "snarkjs: Invalid zkey ~/x/upload.zkey",
    });
  });
});

describe("cross-check from r1cs", () => {
  it("valid when both agree it is valid, with both timings", async () => {
    const res = await withR1cs(u.c1);
    expect(res.verdict).toMatchObject({ result: "valid" });
    expect(zkv.mock.calls[0]?.slice(0, 3)).toEqual([
      MULTIPLIER_R1CS,
      ptau,
      zkvi.mock.calls[0]?.[2],
    ]);
    expect(res.ms.verifyFromR1cs).toBeGreaterThanOrEqual(0);
  });

  it("rejected when both agree it is not", async () => {
    zkvi.mockResolvedValue({ ok: false, log: "no" });
    zkv.mockResolvedValue({ ok: false, log: "no" });
    expect((await withR1cs(u.c1)).verdict).toEqual({
      result: "rejected",
      reason: "zkey-verify-failed",
    });
  });

  it("infra when they disagree, keeping both logs and the timings", async () => {
    zkv.mockResolvedValue({ ok: false, log: "[error] from r1cs: no" });
    const res = await withR1cs(u.c1);
    expect(res.verdict).toEqual({ result: "infra", detail: "zkvi and verify from r1cs disagree" });
    expect(res.log).toBe(`${OK.log}\n[error] from r1cs: no`);
    expect(res.ms).toEqual({
      precheck: expect.any(Number),
      verify: expect.any(Number),
      verifyFromR1cs: expect.any(Number),
    });
  });

  it("a throw is classified like zkvi's: the file's fault, or ours", async () => {
    zkv.mockRejectedValue(new Error("Invalid r1cs section"));
    expect((await withR1cs(u.c1)).verdict).toEqual({
      result: "rejected",
      reason: "malformed",
      detail: "snarkjs (from r1cs): Invalid r1cs section",
    });
    zkv.mockRejectedValue(new IsolationError("timeout", "timed out after 120 s"));
    const res = await withR1cs(u.c1);
    expect(res.verdict).toEqual({ result: "infra", detail: "timed out after 120 s" });
    expect(res.ms.verifyFromR1cs).toBeGreaterThanOrEqual(0);
  });
});
