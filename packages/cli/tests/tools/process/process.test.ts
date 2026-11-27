/** External tools: environment, exit reporting, and bounds that hold against the tool. */
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rejection } from "../../support/errors";
import { assertExecutable, run, runBytes, runTool, toolEnv } from "../../../src/tools";

let dir: string;
const script = async (name: string, body: string) => {
  const path = join(dir, name);
  await writeFile(path, `#!/bin/sh\n${body}\n`);
  await chmod(path, 0o755);
  return path;
};

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "orbinum-tools-"));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe("external tools", () => {
  it("never pass the operator's secrets to a tool", async () => {
    process.env.CF_ACCESS_CLIENT_SECRET = "s3cret";
    try {
      expect(toolEnv()).not.toHaveProperty("CF_ACCESS_CLIENT_SECRET");
      const env = await run(await script("env.sh", "env"), []);
      expect(env).not.toContain("s3cret");
      expect(env).toContain("PATH=");
    } finally {
      delete process.env.CF_ACCESS_CLIENT_SECRET;
    }
  });

  it("return how a tool ended, whatever its exit code", async () => {
    const r = await runTool(await script("exit3.sh", "echo out; echo err >&2; exit 3"), []);
    expect(r).toEqual({ code: 3, signal: null, stdout: "out\n", stderr: "err\n" });
  });

  it("name the program and its sanitised stderr on failure, never its arguments", async () => {
    const bin = await script("fail.sh", 'printf "bad \\033[31minput\\n" >&2; exit 2');
    const error = await rejection(run(bin, ["/secret/path/arg"]));
    expect(error.message).toMatch(/fail\.sh failed \(exit 2\): bad \?\[31minput/);
    expect(error.message).not.toContain("/secret/path/arg");
  });

  it("report a killed tool by its signal, without arguments", async () => {
    const error = await rejection(run(await script("kill.sh", "kill -9 $$"), ["/secret/arg"]));
    expect(error.message).toMatch(/killed by SIGKILL/);
    expect(error.message).not.toContain("/secret/arg");
  });

  it("stop a tool at its timeout", async () => {
    const error = await rejection(run(await script("slow.sh", "sleep 5"), [], { timeoutMs: 200 }));
    expect(error.message).toMatch(/timed out/);
  });

  it("kill a tool that ignores SIGTERM, within its grace period", async () => {
    const started = Date.now();
    const deaf = await script("deaf.sh", "trap '' TERM\nwhile :; do sleep 0.2; done");
    const outcome = await Promise.race([
      rejection(runTool(deaf, [], { timeoutMs: 300 })),
      new Promise<Error>((r) => setTimeout(() => r(new Error("still running")), 6000)),
    ]);
    expect(outcome.message).toMatch(/timed out$/);
    expect(Date.now() - started).toBeLessThan(4000);
  }, 10_000);

  it("fail a tool that exits 0 on SIGTERM after its bound", async () => {
    const polite = await script("polite.sh", "trap 'exit 0' TERM\nsleep 6 & wait");
    expect((await rejection(runTool(polite, [], { timeoutMs: 300 }))).message).toMatch(
      /timed out$/,
    );
  });

  it(
    "stop what a tool left running at its timeout (its process group)",
    { timeout: 10_000 },
    async () => {
      const started = Date.now();
      const forked = await script("forked.sh", "sleep 6 &\necho started");
      expect((await rejection(runTool(forked, [], { timeoutMs: 300 }))).message).toMatch(
        /timed out$/,
      );
      expect(Date.now() - started).toBeLessThan(4000);
    },
  );

  it("refuse a tool that writes more than its output bound", async () => {
    const loud = await script("loud.sh", "head -c 5000 /dev/zero");
    expect((await rejection(runTool(loud, [], { maxOutputBytes: 1000 }))).message).toMatch(
      /wrote too much output$/,
    );
  });

  it("return binary output byte for byte", async () => {
    const bytes = await runBytes(await script("bin.sh", "printf '\\377\\000\\200'"), []);
    expect([...bytes]).toEqual([255, 0, 128]);
  });

  it("check a binary is executable before anything relies on it", async () => {
    await expect(assertExecutable(await script("ok.sh", "true"))).resolves.toBeUndefined();
    const plain = join(dir, "plain");
    await writeFile(plain, "#!/bin/sh\n");
    await expect(assertExecutable(plain)).rejects.toThrow("plain is not an executable file");
    await expect(assertExecutable(join(dir, "none"))).rejects.toThrow(
      "none is not an executable file",
    );
  });

  it("refuse a tool that cannot run, without its arguments", async () => {
    const error = await rejection(run(join(dir, "missing"), ["/secret/arg"]));
    expect(error.message).toMatch(/could not run \(ENOENT\)/);
    expect(error.message).not.toContain("/secret/arg");
  });
});
