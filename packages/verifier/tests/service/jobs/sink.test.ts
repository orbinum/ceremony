/**
 * The server with the job queue as its sink (COORDINATOR §5): jobs run in arrival order, each
 * attempt once, and `/healthz` reports failed pins or a wedged job.
 */
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createQueue,
  createVerifierServer,
  type Inputs,
  jobSinkOf,
  loadConfig,
  runJob,
} from "../../../src/service";
import {
  CEREMONY_ID,
  FakeCoordinator,
  fakeInputs,
  HMAC_KEY,
  jobSpec,
  signedDispatch,
  until,
} from "../../support";

const AUTH = { hmacKey: HMAC_KEY, ceremonyId: CEREMONY_ID };

const listen = async (server: Server) => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};
const close = (server: Server) => {
  server.closeAllConnections();
  return new Promise((r) => server.close(r));
};
const post = (url: string, body: string) =>
  fetch(`${url}/verify`, { method: "POST", headers: signedDispatch(body), body });
const health = async (url: string) => {
  const res = await fetch(`${url}/healthz`);
  return [res.status, await res.json()];
};

describe("server and queue on a host whose pins fail", () => {
  const coordinator = new FakeCoordinator();
  let server: Server;
  let url = "";
  let inputs: Inputs;
  let genesis = { sha256: "", csHash: "00".repeat(64) };
  let queue: ReturnType<typeof createQueue>;

  beforeAll(async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await coordinator.start();
    let dir = "";
    ({ dir, inputs } = await fakeInputs());
    genesis = { sha256: inputs.genesis.shield?.sha256 as string, csHash: "00".repeat(64) };
    const config = loadConfig({
      COORDINATOR_URL: coordinator.url,
      VERIFIER_HMAC_KEY: HMAC_KEY,
      CEREMONY_DIR: dir,
      PTAU: inputs.ptau,
    });
    queue = createQueue((spec) => runJob({ config, inputs }, spec), 60_000);
    server = createVerifierServer(AUTH, jobSinkOf(inputs, queue));
    url = await listen(server);
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await close(server);
    await coordinator.stop();
    await inputs.stage.cleanup();
  });

  it("reports each job as infra in arrival order, runs them all, and never fetches", async () => {
    for (const attempt of [11, 12, 13]) {
      // oxlint-disable-next-line no-await-in-loop -- dispatch order is the point
      expect((await post(url, JSON.stringify(jobSpec(attempt, genesis)))).status).toBe(202);
    }
    const reports = await coordinator.reportsAt(3);
    expect(reports.map((r) => [r.job.attempt, r.result])).toEqual([
      [11, "infra"],
      [12, "infra"],
      [13, "infra"],
    ]);
    expect(reports[0]).toEqual({
      job: reports[0]?.job,
      result: "infra",
      detail: "ptau size 12, expected 75580568",
    });
    expect(coordinator.fetches()).toEqual([]);
    await until(5_000, "queue drained", () => queue.pending() === 0);
    // The pins failed: the service says so.
    expect(await health(url)).toEqual([503, { ok: false }]);
  });

  it("runs a repeated dispatch once", async () => {
    const before = coordinator.reports.length;
    const body = JSON.stringify(jobSpec(21, genesis));
    for (let i = 0; i < 3; i++) {
      // oxlint-disable-next-line no-await-in-loop -- the same dispatch, repeated
      const response = await post(url, body);
      // oxlint-disable-next-line no-await-in-loop -- the same dispatch, repeated
      expect([response.status, await response.json()]).toEqual([202, { accepted: "1/shield/21" }]);
    }
    expect((await post(url, JSON.stringify(jobSpec(22, genesis)))).status).toBe(202);
    const reports = await coordinator.reportsAt(before + 2);
    expect(reports.slice(before).map((r) => r.job.attempt)).toEqual([21, 22]);
  });
});

describe("server and queue with a job that outlives its bound", () => {
  let server: Server;
  let url = "";
  let inputs: Inputs;
  let release: (() => void) | undefined;
  let started = false;

  beforeAll(async () => {
    ({ inputs } = await fakeInputs());
    inputs.pinned = true;
    const queue = createQueue(() => {
      started = true;
      return new Promise<void>((r) => (release = r));
    }, 50);
    server = createVerifierServer(AUTH, jobSinkOf(inputs, queue));
    url = await listen(server);
  });
  afterAll(async () => {
    release?.();
    await close(server);
    await inputs.stage.cleanup();
  });

  it("answers 503 while the job is wedged, and 200 once it ends", async () => {
    expect(await health(url)).toEqual([200, { ok: true }]);
    expect(
      (
        await post(
          url,
          JSON.stringify(jobSpec(31, { sha256: "11".repeat(32), csHash: "00".repeat(64) })),
        )
      ).status,
    ).toBe(202);
    await until(5_000, "job started", () => started);
    await vi.waitFor(async () => expect(await health(url)).toEqual([503, { ok: false }]), {
      timeout: 5_000,
    });
    release?.();
    await vi.waitFor(async () => expect(await health(url)).toEqual([200, { ok: true }]), {
      timeout: 5_000,
    });
  });
});
