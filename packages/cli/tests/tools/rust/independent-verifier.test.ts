/**
 * How the independent Rust verifier is run and its exit read; the verdict format itself is core's.
 */
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runIndependentVerifier } from "../../../src/tools";
import { rejection } from "../../support/errors";

const IDS = [
  "well-formed",
  "genesis-start",
  "genesis-source",
  "unchanged",
  "policy",
  "chain",
  "final-delta",
  "scaled-sections",
];
const HASH = "ab".repeat(64);
const INPUT = {
  genesis: "g.zkey",
  final: "f.zkey",
  minContributions: 2,
  beacon: { randomness: "01".repeat(32), iterationsExp: 10 },
  source: { r1cs: "c.r1cs", ptau: "p.ptau" },
};

interface Fake {
  ids?: string[];
  failing?: string[];
  ok?: boolean;
  exit?: number;
  verifier?: string;
}

function verdict({ ids = IDS, failing = [], ok, verifier }: Fake): string {
  return JSON.stringify({
    ok: ok ?? failing.length === 0,
    verifier: verifier ?? "ceremony-verifier 0.1.0",
    cs_hash: HASH,
    entries: [{ index: 1, kind: "contribution", hash: HASH }],
    checks: ids.map((id) => ({ id, title: id, ok: !failing.includes(id) })),
  });
}

describe("the independent verifier's verdict contract", () => {
  let dir: string;
  let n = 0;

  async function fake(spec: Fake): Promise<string> {
    const bin = join(dir, `fake-${n++}.sh`);
    const exit = spec.exit ?? ((spec.failing ?? []).length === 0 ? 0 : 1);
    await writeFile(bin, `#!/bin/sh\ncat <<'JSON'\n${verdict(spec)}\nJSON\nexit ${exit}\n`);
    await chmod(bin, 0o755);
    return bin;
  }

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "orbinum-fake-verifier-"));
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it("accepts a complete passing verdict", async () => {
    const v = await runIndependentVerifier(await fake({}), INPUT);
    expect(v).toMatchObject({ ok: true, failures: [], csHash: HASH });
  });

  it("reads failed checks from a run that exits 1", async () => {
    const v = await runIndependentVerifier(await fake({ failing: ["chain"] }), INPUT);
    expect(v.ok).toBe(false);
    expect(v.failures).toEqual(["chain"]);
  });

  it("passes the exit code on, so one that contradicts the verdict is refused", async () => {
    await expect(runIndependentVerifier(await fake({ exit: 1 }), INPUT)).rejects.toThrow(
      /disagree/,
    );
    const lying = await fake({ failing: ["chain"], ok: true, exit: 0 });
    await expect(runIndependentVerifier(lying, INPUT)).rejects.toThrow(/disagree/);
  });

  it("says how the binary died, without its arguments", async () => {
    const bin = join(dir, "killed.sh");
    await writeFile(bin, "#!/bin/sh\nkill -9 $$\n");
    await chmod(bin, 0o755);
    const error = await rejection(runIndependentVerifier(bin, INPUT));
    expect(error.message).toBe("independent verifier failed (killed by SIGKILL)");
  });

  it("refuses any other exit, and output that is not JSON, without echoing it", async () => {
    const crashed = join(dir, "crashed.sh");
    await writeFile(crashed, "#!/bin/sh\nprintf '\\033[2Kpanic\\n' >&2\nexit 101\n");
    await chmod(crashed, 0o755);
    expect((await rejection(runIndependentVerifier(crashed, INPUT))).message).toBe(
      "independent verifier failed (exit 101): ?[2Kpanic",
    );
    const noisy = join(dir, "noisy.sh");
    await writeFile(noisy, "#!/bin/sh\nprintf '\\033[2Kok\\n'\n");
    await chmod(noisy, 0o755);
    expect((await rejection(runIndependentVerifier(noisy, INPUT))).message).toBe(
      "independent verifier output: not valid JSON",
    );
  });

  it("refuses a run that exits 0 with no verdict", async () => {
    const silent = join(dir, "silent.sh");
    await writeFile(silent, "#!/bin/sh\nexit 0\n");
    await chmod(silent, 0o755);
    expect((await rejection(runIndependentVerifier(silent, INPUT))).message).toBe(
      "independent verifier failed (exit 0)",
    );
  });
});
