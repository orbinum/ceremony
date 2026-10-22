/**
 * Attacks on the independent Rust verifier's contract (SPEC §8.4, KL-19): fake binaries that check
 * less, lie, or misbehave.
 */
import { existsSync } from "node:fs";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkIndependent,
  type Chained,
  type InitCircuit,
  REQUIRED_CHECKS,
} from "@orbinum-ceremony/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runIndependentVerifier, runTool } from "../../src/tools";
import { rejection } from "../support/errors";

const HASH = "ab".repeat(64);
const INPUT = {
  genesis: "g.zkey",
  final: "f.zkey",
  minContributions: 1,
  beacon: { randomness: "01".repeat(32), iterationsExp: 10 },
  source: { r1cs: "c.r1cs", ptau: "p.ptau" },
};
const IDS: string[] = [...REQUIRED_CHECKS];

let dir: string;
let n = 0;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "orbinum-attack-rust-"));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

async function script(body: string): Promise<string> {
  const bin = join(dir, `fake-${n++}.sh`);
  await writeFile(bin, `#!/bin/sh\n${body}\n`);
  await chmod(bin, 0o755);
  return bin;
}

const printing = (stdout: string, exit: number) =>
  script(`cat <<'JSON'\n${stdout}\nJSON\nexit ${exit}`);

const verdict = (over: Record<string, unknown> = {}, ids = IDS, failing: string[] = []) =>
  JSON.stringify({
    ok: failing.length === 0,
    verifier: "ceremony-verifier 0.1.0",
    cs_hash: HASH,
    entries: [{ index: 1, kind: "contribution", hash: HASH }],
    checks: ids.map((id) => ({ id, ok: !failing.includes(id) })),
    ...over,
  });

const run = async (stdout: string, exit = 0) =>
  runIndependentVerifier(await printing(stdout, exit), INPUT);

describe("independent verifier contract (fake binaries)", () => {
  it("refuses fewer checks than required", async () => {
    await expect(run(verdict({}, IDS.slice(1)))).rejects.toThrow(/expected \[/);
  });

  it("refuses an extra check id", async () => {
    await expect(run(verdict({}, [...IDS, "bonus"]))).rejects.toThrow(/expected \[/);
  });

  it("refuses two ids folded into one with a comma", async () => {
    const folded = [`${IDS[0]},${IDS[1]}`, ...IDS.slice(2), "padding"];
    await expect(run(verdict({}, folded))).rejects.toThrow(/expected \[/);
  });

  it("refuses a duplicated id standing for a missing one", async () => {
    const dup = [...IDS.filter((i) => i !== "policy"), "chain"];
    await expect(run(verdict({}, dup))).rejects.toThrow(/expected \[/);
  });

  it("refuses exit 0 with a failed check, and exit 1 with all checks ok", async () => {
    await expect(run(verdict({}, IDS, ["chain"]), 0)).rejects.toThrow(/disagree/);
    await expect(run(verdict(), 1)).rejects.toThrow(/disagree/);
  });

  it("refuses another name, no version, a lower version or trailing words", async () => {
    const versions = [
      "ceremony-verifier-evil 0.1.0",
      "evil 0.1.0",
      "ceremony-verifier",
      "ceremony-verifier 0.0.9",
      "ceremony-verifier 0.1.0 patched",
      "ceremony-verifier v0.1.0",
      "ceremony-verifier 0.1.0-rc1",
      " ceremony-verifier 0.1.0",
    ];
    const refusals = await Promise.all(
      versions.map(async (v) => [v, (await rejection(run(verdict({ verifier: v })))).message]),
    );
    expect(Object.fromEntries(refusals)).toEqual(
      Object.fromEntries(versions.map((v) => [v, expect.stringMatching(/verdict/)])),
    );
  });

  it("reads a version with leading zeros numerically (00.1.00 is 0.1.0)", async () => {
    expect((await run(verdict({ verifier: "ceremony-verifier 00.1.00" }))).ok).toBe(true);
  });

  it("treats a different or missing csHash as a disagreement with init.json", async () => {
    const circuit = { name: "shield", cs_hash: "cd".repeat(64) } as InitCircuit;
    const records = [
      { type: "contribution", circuit: "shield", contribution_hash: HASH },
    ] as unknown as Chained[];
    const v = await run(verdict());
    expect(checkIndependent(v, records, circuit)).toEqual(["its csHash differs from init.json"]);
    const missing = await run(verdict({ cs_hash: undefined }));
    expect(checkIndependent(missing, records, { ...circuit, cs_hash: HASH })).toEqual([
      "its csHash differs from init.json",
    ]);
  });

  it("treats an h_k chain that differs from the transcript (reordered, dropped) as a disagreement", async () => {
    const circuit = { name: "shield", cs_hash: HASH } as InitCircuit;
    const records = [
      { type: "contribution", circuit: "shield", contribution_hash: HASH },
      { type: "contribution", circuit: "shield", contribution_hash: "cd".repeat(64) },
    ] as unknown as Chained[];
    const v = await run(
      verdict({
        entries: [
          { index: 1, kind: "contribution", hash: "cd".repeat(64) },
          { index: 2, kind: "contribution", hash: HASH },
          { index: 3, kind: "beacon", hash: HASH },
        ],
      }),
    );
    expect(checkIndependent(v, records, circuit)).toEqual([
      "its h_k chain differs from the transcript",
    ]);
  });

  it("leaves the single trailing beacon entry to the Rust 'policy' check", async () => {
    const circuit = { name: "shield", cs_hash: HASH } as InitCircuit;
    const records = [
      { type: "contribution", circuit: "shield", contribution_hash: HASH },
    ] as unknown as Chained[];
    const noBeacon = await run(verdict());
    expect(checkIndependent(noBeacon, records, circuit)).toEqual([]);
  });

  it("refuses entries out of order and entries without an index", async () => {
    await expect(
      run(verdict({ entries: [{ index: 2, kind: "contribution", hash: HASH }] })),
    ).rejects.toThrow(/entries\[0\]\.index/);
    await expect(run(verdict({ entries: [{ kind: "contribution", hash: HASH }] }))).rejects.toThrow(
      /entries\[0\]\.index/,
    );
  });

  it("refuses output beyond 64 MiB", async () => {
    const bin = await script("head -c 70000000 /dev/zero; exit 0");
    expect((await rejection(runIndependentVerifier(bin, INPUT))).message).toMatch(
      /wrote too much output/,
    );
  }, 60_000);

  it("kills a hung tool (and its children) at its timeout", async () => {
    const marker = join(dir, "child-alive");
    const bin = await script(`(sleep 3; touch '${marker}') & sleep 30`);
    const started = Date.now();
    await expect(runTool(bin, [], { timeoutMs: 300 })).rejects.toThrow(/timed out/);
    expect(Date.now() - started).toBeLessThan(5000);
    await new Promise((r) => setTimeout(r, 3500));
    expect(existsSync(marker)).toBe(false);
  }, 20_000);

  it("resolves duplicate JSON keys last-wins, as JSON.parse does", async () => {
    const base = JSON.parse(verdict()) as Record<string, unknown>;
    const text = `{"ok":false,${JSON.stringify(base).slice(1)}`;
    expect((await run(text)).ok).toBe(true);
    const checks = IDS.map((id) => `{"id":"${id}","ok":false,"ok":true}`).join(",");
    const text2 = JSON.stringify({ ...base, checks: [] }).replace(
      '"checks":[]',
      `"checks":[${checks}]`,
    );
    expect((await run(text2)).ok).toBe(true);
  });

  it("ignores unknown verdict fields", async () => {
    expect((await run(verdict({ skipped: ["genesis-source"] }))).ok).toBe(true);
  });
});
