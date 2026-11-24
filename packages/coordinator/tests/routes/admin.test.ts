/**
 * Operator routes in a local run (COORDINATOR §3): setup files published once and immutable, the
 * setup frozen once against them, the state actions (finalizing has its own route), and bounded
 * bodies.
 */
import { runDurableObjectAlarm } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { CEREMONY_LAYOUT, serializeJson, sha256Hex } from "@orbinum-ceremony/core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  call,
  clearBuckets,
  freshId,
  INIT,
  json,
  publishedSetup,
  raw,
  readTranscript,
  refusal,
  setupInput,
  stubOf,
} from "../support";

beforeEach(clearBuckets);

describe("operator routes (local run)", () => {
  it("configures once against the published files, then runs the states", async () => {
    const name = freshId("admin");
    const as = { ceremony: name };
    const state = (action: string) =>
      call("POST", "/admin/state", undefined, { ...as, body: { action } });
    const configure = (body: unknown) =>
      call("POST", "/admin/configure", undefined, { ...as, body });
    const setup = await publishedSetup(Date.now() - 1000, Date.now() + 86_400_000);
    // Sizes or hashes that are not the published files are refused, and nothing is configured.
    const wrongSize = await configure({
      ...setup,
      genesisSizes: { ...setup.genesisSizes, shield: 1 },
    });
    expect(await refusal(wrongSize)).toEqual([400, "malformed-setup"]);
    expect(await stubOf(name).setup()).toBeNull();

    expect([(await configure(setup)).status, (await configure(setup)).status]).toEqual([200, 200]);
    expect(await refusal(await configure({ ...setup, init: `${setup.init} ` }))).toEqual([
      400,
      "malformed-setup",
    ]);
    const text = await call("POST", "/admin/configure", undefined, {
      ...as,
      body: "x",
      headers: { "content-type": "text/plain" },
    });
    expect(await refusal(text)).toEqual([400, "malformed"]);

    await runDurableObjectAlarm(stubOf(name));
    expect((await state("pause")).status).toBe(200);
    expect(await refusal(await state("pause"))).toEqual([409, "invalid-transition"]);
    expect((await state("resume")).status).toBe(200);
    expect(await refusal(await state("explode"))).toEqual([400, "malformed"]);
    expect(await refusal(await state("finalize"))).toEqual([400, "malformed"]);
    expect((await state("close")).status).toBe(200);
    expect(await refusal(await state("resume"))).toEqual([409, "invalid-transition"]);
    const { records } = await readTranscript(stubOf(name));
    expect(records.map((r) => (r as { to?: string }).to)).toEqual([
      "OPEN",
      "PAUSED",
      "OPEN",
      "CLOSED",
    ]);
  });

  it("refuses an oversized state action before reading it", async () => {
    const name = freshId("admin-limit");
    const r = await call("POST", "/admin/state", undefined, {
      ceremony: name,
      body: { action: "pause", padding: "x".repeat(2048) },
    });
    expect(await refusal(r)).toEqual([413, "too-large"]);
    expect(await stubOf(name).snapshot()).toBeNull();
  });

  it("refuses an operator call without the operator header, even locally", async () => {
    const r = await raw("/admin/state", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "pause" }),
    });
    expect(await refusal(r)).toEqual([403, "forbidden"]);
  });
});

const sha = (s: string) => sha256Hex(new TextEncoder().encode(s));
const put = (key: string, body: string, headers: Record<string, string> = {}) =>
  raw(`/admin/artifacts/${key}`, {
    method: "PUT",
    headers: { "x-ceremony-operator": "1", "x-content-sha256": sha(body), ...headers },
    body,
  });

describe("setup files (cli publish-init)", () => {
  it("publishes a setup file once; the same bytes again are a no-op, other bytes are refused", async () => {
    const { announcement } = setupInput(Date.now(), Date.now() + 86_400_000);
    expect((await put("ceremony.json", announcement)).status).toBe(201);
    expect(await json(await put("ceremony.json", announcement))).toEqual({
      ok: true,
      key: "ceremony.json",
      unchanged: true,
    });
    expect(await refusal(await put("ceremony.json", `${announcement} `))).toEqual([
      409,
      "immutable",
    ]);
    const served = await call("GET", "/artifacts/ceremony.json");
    expect([await served.text(), served.headers.get("content-type")]).toEqual([
      announcement,
      "application/json",
    ]);
  });

  it("takes ceremony.json and init.json only as valid documents within the document bound", async () => {
    for (const key of [CEREMONY_LAYOUT.announcement, CEREMONY_LAYOUT.init]) {
      for (const body of ["{}", "x", `${serializeJson(INIT)} `, " ".repeat(1024 * 1024 + 1)]) {
        // oxlint-disable-next-line no-await-in-loop -- one file at a time
        expect(await refusal(await put(key, body))).toEqual([400, "malformed"]);
      }
      // oxlint-disable-next-line no-await-in-loop -- one key at a time
      expect(await env.PUBLIC.head(key)).toBeNull();
    }
  });

  it("serves every setup file with its type", async () => {
    expect((await put(CEREMONY_LAYOUT.init, serializeJson(INIT))).status).toBe(201);
    expect((await put(CEREMONY_LAYOUT.r1cs("transfer"), "r1cs")).status).toBe(201);
    const r = await call("GET", `/artifacts/${CEREMONY_LAYOUT.r1cs("transfer")}`);
    expect(r.headers.get("content-type")).toBe("application/octet-stream");
  });

  it("takes a circuit's files only for a circuit of the published init.json", async () => {
    expect(await refusal(await put(CEREMONY_LAYOUT.r1cs("transfer"), "r1cs"))).toEqual([
      409,
      "invalid-transition",
    ]);
    expect((await put(CEREMONY_LAYOUT.init, serializeJson(INIT))).status).toBe(201);
    for (const key of [CEREMONY_LAYOUT.r1cs("private_sweep"), CEREMONY_LAYOUT.zkey("other", 0)]) {
      // oxlint-disable-next-line no-await-in-loop -- one key at a time
      expect(await refusal(await put(key, "x"))).toEqual([400, "malformed"]);
      // oxlint-disable-next-line no-await-in-loop -- one key at a time
      expect(await env.PUBLIC.head(key)).toBeNull();
    }
    expect((await put(CEREMONY_LAYOUT.zkey("shield", 0), "genesis")).status).toBe(201);
  });

  it("refuses other keys, a missing hash or length, and bytes that do not match", async () => {
    const refusals = [
      await put("contributions/shield/1.zkey", "x"),
      await put("transcript.json", "x"),
      await put("genesis/init.json", "x", { "x-content-sha256": sha("y") }),
      await put("genesis/init.json", "x", { "x-content-sha256": "nothex" }),
    ];
    for (const r of refusals) {
      // oxlint-disable-next-line no-await-in-loop -- one answer at a time
      expect(await refusal(r)).toEqual([400, "malformed"]);
    }
    const chunked = await raw("/admin/artifacts/genesis/init.json", {
      method: "PUT",
      headers: { "x-ceremony-operator": "1", "x-content-sha256": sha("x") },
      // A stream of unknown length: no Content-Length.
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("x"));
          controller.close();
        },
      }),
    });
    expect(await refusal(chunked)).toEqual([400, "malformed"]);
    expect(await env.PUBLIC.head("genesis/init.json")).toBeNull();
    expect(await env.PUBLIC.head("contributions/shield/1.zkey")).toBeNull();
  });

  it("answers storage when the bucket fails, without writing", async () => {
    const r = await call("PUT", "/admin/artifacts/ceremony.json", undefined, {
      env: { PUBLIC: { head: () => Promise.reject(new Error("R2 down")) } as unknown as R2Bucket },
      headers: { "x-content-sha256": sha("{}"), "content-length": "2" },
      body: {},
    });
    expect(await refusal(r)).toEqual([503, "storage"]);
    expect(await env.PUBLIC.head("ceremony.json")).toBeNull();
  });
});
