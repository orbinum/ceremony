/** The pinned ptau when no mirror answers, and where it is looked for first. */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PTAU } from "@orbinum-ceremony/core";
import { obtainPtau } from "../../../src/commands/init";

describe("obtainPtau when no mirror answers", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "orbinum-ptau-"));
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  // The original Hermez hosts answer 403 since September 2026: the operator must learn that any
  // copy works with --ptau, because the pin is what is checked.
  it("says why and how to continue with a local copy", async () => {
    const error = await obtainPtau(dir, undefined, ["http://127.0.0.1:9/ptau"]).then(
      () => undefined,
      (e: unknown) => e as Error,
    );
    expect(error?.message).toMatch(/--ptau <file>/);
    expect(error?.message).toMatch(/No mirror answered/);
    expect(error?.message).toContain("6a6277a2");
  });

  it("tries Orbinum's copies before the original hosts, all over https", () => {
    expect(PTAU.mirrors.every((m) => m.startsWith("https://") && m.endsWith(`/${PTAU.file}`))).toBe(
      true,
    );
    expect(PTAU.mirrors.findIndex((m) => m.includes("orbinum"))).toBe(0);
    expect(PTAU.mirrors.at(-1)).toContain("hermez");
  });
});
