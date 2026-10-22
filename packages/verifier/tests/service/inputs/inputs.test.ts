/** The pinned inputs (SPEC §2.5, §7): canonical init.json, staged copies pinned on the copies. */
import { chmod, readdir, rm, stat, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serializeJson } from "@orbinum-ceremony/core";
import { describe, expect, it } from "vitest";
import {
  checkPins,
  ensurePinned,
  loadConfig,
  loadInputs,
  type ServiceConfig,
} from "../../../src/service";
import { fakeCeremony, fakeInputs, HMAC_KEY, PTAU_PATH, shieldCeremony } from "../../support";

const configOf = (dir: string, ptau: string): ServiceConfig =>
  loadConfig({
    COORDINATOR_URL: "http://127.0.0.1:1",
    VERIFIER_HMAC_KEY: HMAC_KEY,
    CEREMONY_DIR: dir,
    PTAU: ptau,
  });

/** Stage directories of this suite still on disk (a failed load must leave none). */
const stages = async () =>
  (await readdir(tmpdir())).filter((n) => n.startsWith("orbinum-verifier-inputs-"));

const initPath = (dir: string) => join(dir, "genesis", "init.json");

describe("service inputs", () => {
  it("refuses an init.json that is not a valid one", async () => {
    const { dir, ptau } = await fakeCeremony();
    await writeFile(initPath(dir), '{"schema":1}\n');
    await expect(loadInputs(configOf(dir, ptau))).rejects.toThrow(
      'init: missing field "ceremony_id"',
    );
  });

  it("refuses a missing init.json", async () => {
    const { dir, ptau } = await fakeCeremony();
    await rm(initPath(dir));
    await expect(loadInputs(configOf(dir, ptau))).rejects.toThrow(/^ENOENT/);
  });

  it("refuses an init.json whose bytes are not its canonical form", async () => {
    const { dir, ptau, init } = await fakeCeremony();
    for (const text of [
      JSON.stringify(init),
      `${serializeJson(init)}\n`,
      `﻿${serializeJson(init)}`,
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one spelling at a time
      await writeFile(initPath(dir), text);
      // oxlint-disable-next-line no-await-in-loop -- one spelling at a time
      await expect(loadInputs(configOf(dir, ptau))).rejects.toThrow(/^init\.json: /);
    }
    await writeFile(initPath(dir), new Uint8Array([0x7b, 0xe9, 0x7d]));
    await expect(loadInputs(configOf(dir, ptau))).rejects.toThrow("init.json: not valid UTF-8");
  });

  it("refuses an init.json that is not the pinned configuration", async () => {
    const { dir, ptau, init } = await fakeCeremony();
    const wrong = { ...init, tooling: { ...init.tooling, snarkjs: "0.7.5" } };
    await writeFile(initPath(dir), serializeJson(wrong));
    await expect(loadInputs(configOf(dir, ptau))).rejects.toThrow("init.json: snarkjs 0.7.5");
  });

  it("refuses a genesis that does not match init.json, and leaves no copies", async () => {
    const { dir, ptau } = await fakeCeremony();
    const before = await stages();
    await writeFile(join(dir, "genesis", "shield.genesis.zkey"), "tampered");
    await expect(loadInputs(configOf(dir, ptau))).rejects.toThrow(
      "shield genesis does not match init.json",
    );
    expect(await stages()).toEqual(before);
  });

  it("refuses a missing genesis", async () => {
    const { dir, ptau } = await fakeCeremony();
    await rm(join(dir, "genesis", "shield.genesis.zkey"));
    await expect(loadInputs(configOf(dir, ptau))).rejects.toThrow("ENOENT");
  });

  it("refuses a missing, wrong or symlinked ptau", async () => {
    const { dir, ptau } = await fakeCeremony();
    await expect(loadInputs(configOf(dir, ptau))).rejects.toThrow("ptau size");
    await expect(loadInputs(configOf(dir, join(dir, "none.ptau")))).rejects.toThrow("ENOENT");
    const link = join(dir, "link.ptau");
    await symlink(ptau, link);
    await expect(loadInputs(configOf(dir, link))).rejects.toThrow("ELOOP");
  });

  it("refuses a ptau larger than its pinned size before copying it", async () => {
    const { dir } = await fakeCeremony();
    const big = join(dir, "big.ptau");
    await writeFile(big, "");
    await truncate(big, 75_580_568 + 1);
    await expect(loadInputs(configOf(dir, big))).rejects.toThrow(
      "ptau: larger than 75580568 bytes",
    );
  });

  it("refuses a symlinked genesis", async () => {
    const { dir, ptau } = await fakeCeremony();
    const { dir: other } = await fakeCeremony();
    await rm(join(dir, "genesis", "shield.genesis.zkey"));
    await symlink(
      join(other, "genesis", "shield.genesis.zkey"),
      join(dir, "genesis", "shield.genesis.zkey"),
    );
    await expect(loadInputs(configOf(dir, ptau))).rejects.toThrow("ELOOP");
  });

  it("refuses a genesis reached through a symlinked genesis/ directory", async () => {
    const { dir, ptau } = await fakeCeremony();
    const { dir: other } = await fakeCeremony();
    await rm(join(dir, "genesis"), { recursive: true });
    await symlink(join(other, "genesis"), join(dir, "genesis"));
    await expect(loadInputs(configOf(dir, ptau))).rejects.toThrow(
      "shield.genesis.zkey: a parent directory leaves the ceremony directory",
    );
  });

  it("stages its copies again when the host removed one, before pinning", async () => {
    const { inputs } = await fakeInputs();
    try {
      const first = inputs.stage.dir;
      await rm(inputs.genesis.shield?.path as string);
      // The stand-in ptau cannot pass its pin, so the run ends there, after a new stage.
      await expect(ensurePinned(inputs)).rejects.toThrow("ptau size 12");
      expect(inputs.stage.dir).not.toBe(first);
      await expect(stat(first)).rejects.toThrow("ENOENT");
      expect((await stat(inputs.genesis.shield?.path as string)).isFile()).toBe(true);
    } finally {
      await inputs.stage.cleanup();
    }
  });

  it("does not stage again for a copy that is present but wrong", async () => {
    const { inputs } = await fakeInputs();
    try {
      const first = inputs.stage.dir;
      const copy = inputs.genesis.shield?.path as string;
      await chmod(copy, 0o600);
      await writeFile(copy, "changed after startup");
      await expect(ensurePinned(inputs)).rejects.toThrow("shield genesis does not match init.json");
      expect(inputs.stage.dir).toBe(first);
      expect(inputs.pinned).toBe(false);
    } finally {
      await inputs.stage.cleanup();
    }
  });

  describe.skipIf(!PTAU_PATH)("with the real ptau", { timeout: 180_000 }, () => {
    it("stages read-only copies, pins them, and re-checks the copies only", async () => {
      const { dir } = await shieldCeremony(PTAU_PATH as string);
      const inputs = await loadInputs(configOf(dir, PTAU_PATH as string));
      try {
        expect(inputs.pinned).toBe(true);
        expect(inputs.ptau.startsWith(inputs.stage.dir)).toBe(true);
        expect(inputs.genesis.shield?.path.startsWith(inputs.stage.dir)).toBe(true);
        expect((await stat(inputs.ptau)).mode & 0o777).toBe(0o400);
        expect((await stat(inputs.genesis.shield?.path as string)).mode & 0o777).toBe(0o400);

        // The originals no longer matter; a changed copy does.
        await writeFile(join(dir, "genesis", "shield.genesis.zkey"), "changed after startup");
        await checkPins(inputs);
        expect(inputs.pinned).toBe(true);
        await chmod(inputs.ptau, 0o600);
        await writeFile(inputs.ptau, "tampered");
        await expect(checkPins(inputs)).rejects.toThrow("ptau size");
        expect(inputs.pinned).toBe(false);
      } finally {
        await inputs.stage.cleanup();
      }
    });
  });
});
