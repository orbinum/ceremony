/**
 * Isolated tasks: one child per task, bounded in time and memory, killed on every exit path; a
 * crash's stderr is kept apart from the message that may leave the host. A non-string error code
 * is dropped by the child, not forwarded. Time bounds leave room for a child to start and write
 * its pid under load; macOS adds __CF_USER_TEXT_ENCODING to every process itself.
 */
import { execFile, fork } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  IsolationError,
  LIMITS,
  MAX_RSS_BYTES,
  runIsolated,
  terminateIsolated,
} from "../../src/isolate";
import { until } from "../support";

const worker = (name: string) => join(import.meta.dirname, "workers", `${name}.ts`);
const LIMITS_10S = { timeoutMs: 10_000, maxRssBytes: MAX_RSS_BYTES };

const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (error) {
    return error;
  }
  throw new Error("expected a rejection");
};

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pidIn(pidFile: string): Promise<number> {
  for (let i = 0; i < 200; i++) {
    const pid = Number(await readFile(pidFile, "utf8").catch(() => ""));
    if (pid > 0) return pid;
    await sleep(50);
  }
  throw new Error("the worker never wrote its pid");
}

const pidFile = async () => join(await mkdtemp(join(tmpdir(), "orbinum-isolate-")), "pid");

const gone = (pid: number) => until(5_000, `process ${pid} gone`, () => !alive(pid));

const TSX = join(import.meta.dirname, "..", "..", "..", "..", "node_modules", ".bin", "tsx");

describe("isolated tasks", { timeout: 30_000 }, () => {
  it("returns the child's answer, from another process", async () => {
    const r = await runIsolated<{ value: number }, { doubled: number; pid: number }>(
      worker("echo"),
      { value: 21 },
      LIMITS_10S,
    );
    expect(r.doubled).toBe(42);
    expect(r.pid).not.toBe(process.pid);
  });

  it("runs concurrent tasks each in its own process", async () => {
    const all = await Promise.all(
      [1, 2, 3, 4].map((value) =>
        runIsolated<{ value: number }, { doubled: number; pid: number }>(
          worker("echo"),
          { value },
          LIMITS_10S,
        ),
      ),
    );
    expect(all.map((r) => r.doubled)).toEqual([2, 4, 6, 8]);
    expect(new Set(all.map((r) => r.pid)).size).toBe(4);
  });

  it("kills a task that outlives its time bound, and the process is gone", async () => {
    const file = await pidFile();
    const error = await failure(
      runIsolated(
        worker("hang"),
        { pidFile: file },
        { timeoutMs: 5_000, maxRssBytes: MAX_RSS_BYTES },
      ),
    );
    expect(error).toBeInstanceOf(IsolationError);
    expect(error).toMatchObject({ failure: "timeout", message: "timed out after 5 s" });
    await gone(await pidIn(file));
  });

  it("stops a task above its resident-memory bound, outside the JS heap too", async () => {
    const error = await failure(
      runIsolated(worker("grow"), {}, { timeoutMs: 20_000, maxRssBytes: 256 * 1024 ** 2 }),
    );
    expect(error).toMatchObject({ failure: "memory", message: "stopped above 256 MB resident" });
  });

  it("keeps a crash's stderr out of its message, redacted and control bytes stripped", async () => {
    const error = await failure(runIsolated(worker("dies"), {}, LIMITS_10S));
    expect(error).toMatchObject({
      failure: "crashed",
      message: "exited (3) without an answer",
      stderr: "fatal ?[31mboom?[0m at ~/install/node_modules/x.js",
    });
  });

  it("keeps only a bounded part of a flooded stderr", async () => {
    const error = await failure(runIsolated(worker("noisy"), {}, LIMITS_10S));
    expect(error).toMatchObject({ failure: "crashed", message: "exited (2) without an answer" });
    expect((error as IsolationError).stderr).toBe("x".repeat(2048));
  });

  it("treats a clean exit without an answer as a crash", async () => {
    const error = await failure(runIsolated(worker("exits"), {}, LIMITS_10S));
    expect(error).toMatchObject({ failure: "crashed", message: "exited (0) without an answer" });
  });

  it("treats a missing entry as a crash", async () => {
    const error = await failure(runIsolated(worker("missing"), {}, LIMITS_10S));
    expect(error).toBeInstanceOf(IsolationError);
    expect(error).toMatchObject({ failure: "crashed", message: "exited (1) without an answer" });
    expect((error as IsolationError).stderr).toContain("ERR_MODULE_NOT_FOUND");
  });

  it("starts children from any working directory (systemd's default is /)", async () => {
    const script = join(import.meta.dirname, "scripts", "run-echo.ts");
    const out = await new Promise<string>((resolve, reject) =>
      execFile(TSX, [script], { cwd: "/", timeout: 25_000 }, (error, stdout, stderr) =>
        error ? reject(new Error(`${error.message}\n${stderr}`)) : resolve(stdout),
      ),
    );
    expect(JSON.parse(out)).toMatchObject({ doubled: 42 });
  });

  it("treats a task killed from outside as a crash", async () => {
    const file = await pidFile();
    const task = failure(runIsolated(worker("hang"), { pidFile: file }, LIMITS_10S));
    process.kill(await pidIn(file), "SIGKILL");
    expect(await task).toMatchObject({
      failure: "crashed",
      message: "exited (SIGKILL) without an answer",
    });
  });

  it("stops every live task on terminateIsolated", async () => {
    const file = await pidFile();
    const task = failure(runIsolated(worker("idle"), { pidFile: file }, LIMITS_10S));
    const pid = await pidIn(file);
    terminateIsolated();
    expect(await task).toMatchObject({ failure: "crashed", message: /SIGKILL/ });
    await gone(pid);
  });

  it("passes the task's own error through as a plain error, with its code, redacted", async () => {
    const plain = await failure(
      runIsolated(worker("fails"), { message: "bad zkey: truncated section 9" }, LIMITS_10S),
    );
    expect(plain).not.toBeInstanceOf(IsolationError);
    expect((plain as Error).message).toBe("bad zkey: truncated section 9");
    expect(plain).not.toHaveProperty("code");

    const coded = await failure(
      runIsolated(
        worker("fails"),
        { message: `EMFILE: too many open files, open '${homedir()}/x.zkey'`, code: "EMFILE" },
        LIMITS_10S,
      ),
    );
    expect(coded).not.toBeInstanceOf(IsolationError);
    expect(coded).toMatchObject({
      code: "EMFILE",
      message: "EMFILE: too many open files, open '~/x.zkey'",
    });

    const numeric = await failure(
      runIsolated(worker("fails"), { message: "odd", code: 7 }, LIMITS_10S),
    );
    expect(numeric).not.toHaveProperty("code");
  });

  it.each([
    ["not an object", "garbage"],
    ["null", null],
    ["no ok flag", { value: 1 }],
    ["a truthy non-boolean ok", { ok: "yes", value: 1 }],
    ["an error that is not a string", { ok: false, error: 42 }],
    ["a code that is not a string", { ok: false, error: "x", code: 5 }],
  ])("treats a malformed reply (%s) as a crash, never a throw", async (_, reply) => {
    const error = await failure(runIsolated(worker("replies"), { reply }, LIMITS_10S));
    expect(error).toBeInstanceOf(IsolationError);
    expect(error).toMatchObject({ failure: "crashed", message: "malformed reply" });
  });

  it("checks the answer's value when told how", async () => {
    const error = await failure(
      runIsolated(
        worker("echo"),
        { value: 1 },
        LIMITS_10S,
        (v): v is string => typeof v === "string",
      ),
    );
    expect(error).toMatchObject({ failure: "crashed", message: "malformed reply value" });
  });

  it("gives the child no variable but PATH, TMPDIR and NODE_ENV (no secret reaches it)", async () => {
    process.env.VERIFIER_HMAC_KEY = "fake-secret-for-this-test";
    try {
      const keys = await runIsolated<unknown, string[]>(worker("env"), {}, LIMITS_10S);
      expect(keys).not.toContain("VERIFIER_HMAC_KEY");
      const inherited = ["NODE_ENV", "PATH", "TMPDIR"].filter((k) => process.env[k] !== undefined);
      expect(keys.filter((k) => !k.startsWith("__CF_"))).toEqual(inherited);
    } finally {
      delete process.env.VERIFIER_HMAC_KEY;
    }
  });

  it("the child exits when its parent goes away (IPC disconnect)", async () => {
    const file = await pidFile();
    const child = fork(worker("idle"), {
      execArgv: ["--import", "tsx"],
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    try {
      const exited = new Promise<number | null>((r) => child.once("exit", (code) => r(code)));
      child.send({ task: { pidFile: file }, maxRssBytes: MAX_RSS_BYTES });
      await pidIn(file);
      child.disconnect();
      const code = await Promise.race([exited, sleep(5_000).then(() => "still running")]);
      expect(code).toBe(0);
    } finally {
      child.kill("SIGKILL");
    }
  });

  it("bounds every snarkjs class well above the measured runs", () => {
    expect(LIMITS.heavy.timeoutMs).toBeGreaterThanOrEqual(4 * 14_000);
    expect(LIMITS.medium.timeoutMs).toBeGreaterThanOrEqual(4 * 6_000);
    expect(MAX_RSS_BYTES).toBeGreaterThanOrEqual(2 * 895 * 1024 ** 2);
  });
});
