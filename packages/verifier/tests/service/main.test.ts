/**
 * The service process (`tsx src/service/main.ts`, COORDINATOR §5): startup refusals that fail
 * fast, and, with the real ptau, a start from `/` and a draining shutdown.
 */
import { chmod, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { type InitRecord, sha256Hex } from "@orbinum-ceremony/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contribute } from "../../src";
import {
  exitWithin,
  FakeCoordinator,
  fakeCeremony,
  freePort,
  HMAC_KEY,
  jobSpec,
  PTAU_PATH,
  shieldCeremony,
  signedDispatch,
  spawnService,
  until,
  waitHealthy,
} from "../support";

describe("service process", { timeout: 60_000 }, () => {
  it("exits non-zero naming every missing variable", async () => {
    const service = spawnService({});
    expect((await exitWithin(service)).code).toBe(1);
    expect(service.output()).toContain(
      "verifier: missing environment: COORDINATOR_URL, VERIFIER_HMAC_KEY, CEREMONY_DIR, PTAU",
    );
  });

  it("exits non-zero on an invalid variable, without echoing the key", async () => {
    const key = "a-short-secret";
    const service = spawnService({
      COORDINATOR_URL: "http://coordinator.example",
      VERIFIER_HMAC_KEY: key,
      CEREMONY_DIR: "/nonexistent",
      PTAU: "/nonexistent",
      PORT: "70000",
      HOST: "",
    });
    expect((await exitWithin(service)).code).toBe(1);
    const out = service.output();
    expect(out).toContain("COORDINATOR_URL: must be https:");
    expect(out).toContain("VERIFIER_HMAC_KEY: HMAC key must be at least 32 bytes");
    expect(out).toContain("PORT: must be an integer in [1, 65535]");
    expect(out).toContain("HOST: must be an IP address or localhost");
    expect(out).not.toContain(key);
  });

  it("exits non-zero on an unwritable LOG_DIR, before staging anything", async () => {
    const { dir, ptau } = await fakeCeremony();
    const logs = join(dir, "read-only-logs");
    await mkdir(logs);
    await chmod(logs, 0o500);
    const service = spawnService({
      COORDINATOR_URL: "http://127.0.0.1:1",
      VERIFIER_HMAC_KEY: HMAC_KEY,
      CEREMONY_DIR: dir,
      PTAU: ptau,
      LOG_DIR: logs,
    });
    expect((await exitWithin(service)).code).toBe(1);
    expect(service.output()).toMatch(/verifier: LOG_DIR: not writable: EACCES/);
    expect(service.output()).not.toContain("ptau size");
  });

  it("exits non-zero when its pinned inputs fail", async () => {
    const { dir, ptau } = await fakeCeremony();
    const service = spawnService({
      COORDINATOR_URL: "http://127.0.0.1:1",
      VERIFIER_HMAC_KEY: HMAC_KEY,
      CEREMONY_DIR: dir,
      PTAU: ptau,
    });
    expect((await exitWithin(service)).code).toBe(1);
    expect(service.output()).toContain("verifier: ptau size 12, expected 75580568");
  });

  describe.skipIf(!PTAU_PATH)("running, with the real ptau", { timeout: 300_000 }, () => {
    const coordinator = new FakeCoordinator();
    let dir = "";
    let init: InitRecord;
    beforeAll(async () => {
      await coordinator.start();
      ({ dir, init } = await shieldCeremony(PTAU_PATH as string));
    }, 180_000);
    afterAll(() => coordinator.stop());

    it("starts from /, serves /healthz, and on SIGTERM drains the job in flight", async () => {
      const port = await freePort();
      const url = `http://127.0.0.1:${port}`;
      // systemd's default working directory: snarkjs children must still start.
      const service = spawnService(
        {
          COORDINATOR_URL: coordinator.url,
          VERIFIER_HMAC_KEY: HMAC_KEY,
          CEREMONY_DIR: dir,
          PTAU: PTAU_PATH as string,
          PORT: String(port),
        },
        "/",
      );
      try {
        await waitHealthy(url, service);
        const health = await fetch(`${url}/healthz`);
        expect([health.status, await health.json()]).toEqual([200, { ok: true }]);

        const g = init.circuits[0] as InitRecord["circuits"][number];
        const zkey = join(dir, "honest.zkey");
        const hash = await contribute(join(dir, "genesis", "shield.genesis.zkey"), zkey, "a", "e");
        const bytes = await readFile(zkey);
        const spec = jobSpec(
          1,
          { sha256: g.genesis_sha256, csHash: g.cs_hash },
          { size: bytes.length, outputSha256: sha256Hex(bytes), contributionHash: hash },
        );
        coordinator.objects.set("1/shield/1", zkey);
        // The object is held back, so the job is in flight when the signal arrives.
        coordinator.objectDelayMs = 2_000;
        const body = JSON.stringify(spec);
        const response = await fetch(`${url}/verify`, {
          method: "POST",
          headers: signedDispatch(body),
          body,
        });
        expect(response.status).toBe(202);
        // The job re-checks its pins (the 75 MB ptau included) before it fetches: slow under load.
        await until(60_000, "object fetch", () => coordinator.fetches().length > 0);
        service.child.kill("SIGTERM");

        expect(await exitWithin(service, 60_000)).toEqual({ code: 0, signal: null });
        expect(coordinator.reports).toEqual([
          expect.objectContaining({ result: "valid", contributionHash: hash }),
        ]);
        expect(service.output()).toContain("draining");
      } finally {
        coordinator.objectDelayMs = 0;
        service.child.kill("SIGKILL");
      }
    });
  });
});
