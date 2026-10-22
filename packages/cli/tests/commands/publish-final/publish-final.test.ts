/**
 * `publish-final` against a fake coordinator: final files, then the sealed beacon and finals (SPEC
 * §2.6).
 */
import { readFile, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  CEREMONY_LAYOUT,
  serializeJson,
  sha256Hex,
  type Transcript,
  validateFinalizeRequest,
} from "@orbinum-ceremony/core";
import { afterEach, describe, expect, it } from "vitest";
import { layout } from "../../../src/artifacts";
import { runPublishFinal } from "../../../src/commands/publish-final";
import {
  editJson,
  json,
  localServer,
  rejection,
  type Synthetic,
  syntheticCeremony,
  tamperedCopy,
} from "../../support";

type Route = (req: IncomingMessage, res: ServerResponse, body: Buffer) => void;

const servers: Awaited<ReturnType<typeof localServer>>[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});

/** A coordinator that stores what it is sent; `finalize` answers the finalize call. */
async function coordinator(
  finalize: Route = (_q, res) => json(res, 200, { ok: true }),
  extra = {},
) {
  const server = await localServer({
    "/admin/finalize": finalize,
    ...extra,
    "*": (req, res) =>
      json(res, 201, { ok: true, key: (req.url ?? "").replace("/admin/artifacts/", "") }),
  });
  servers.push(server);
  return server;
}

/** A coordinator already sealed, and one serving a published document. */
const finalized: Route = (_q, res) =>
  json(res, 409, { error: { code: "finalized", message: "finalized" } });
const serve =
  (bytes: Uint8Array | string): Route =>
  (_q, res) =>
    res.writeHead(200, { "content-type": "application/json" }).end(bytes);

const publish = (c: Synthetic, url: string) => runPublishFinal({ dir: c.dir, coordinator: url });

describe("publish-final", () => {
  it("uploads every final file with its hash, then hands over the sealed beacon and finals", async () => {
    const c = await syntheticCeremony();
    const server = await coordinator();
    process.env.CF_ACCESS_CLIENT_ID = "id";
    process.env.CF_ACCESS_CLIENT_SECRET = "secret";
    try {
      expect(await publish(c, server.url)).toBe(c.transcript.records.at(-1)?.chain);
    } finally {
      delete process.env.CF_ACCESS_CLIENT_ID;
      delete process.env.CF_ACCESS_CLIENT_SECRET;
    }
    const puts = server.requests.filter((r) => r.method === "PUT");
    expect(puts.map((r) => r.path)).toEqual([
      `/admin/artifacts/${CEREMONY_LAYOUT.finalZkey("shield")}`,
      `/admin/artifacts/${CEREMONY_LAYOUT.finalVk("shield")}`,
    ]);
    for (const r of puts) expect(r.headers["x-content-sha256"]).toBe(sha256Hex(r.body));
    const post = server.requests.at(-1);
    expect(post?.path).toBe("/admin/finalize");
    const request = validateFinalizeRequest(JSON.parse(String(post?.body)));
    expect(request).toEqual({ beacon: c.transcript.records.at(-1), finals: c.transcript.finals });
    // Plaintext to a local coordinator: the Access token is never sent.
    expect(server.requests.some((r) => "cf-access-client-secret" in r.headers)).toBe(false);
  });

  it("uploads nothing when a final file is not the one its record pins", async () => {
    const c = await syntheticCeremony();
    const copy = await tamperedCopy(c.dir, (d) => writeFile(layout(d).finalVk("shield"), "{}\n"));
    const server = await coordinator();
    expect((await rejection(publish({ ...c, dir: copy }, server.url))).message).toBe(
      "final/shield.vk.json: does not match its final record",
    );
    expect(server.requests).toEqual([]);
  });

  it("refuses a transcript that is not final, before any upload", async () => {
    const server = await coordinator();
    const open = await syntheticCeremony({ finalized: false });
    expect((await rejection(publish(open, server.url))).message).toBe(
      "transcript.json does not end with a sealed beacon: run finalize first",
    );
    const c = await syntheticCeremony();
    const noFinals = await tamperedCopy(c.dir, (d) =>
      editJson<Transcript>(layout(d).transcript, (t) => {
        t.finals = [];
      }),
    );
    expect((await rejection(publish({ ...c, dir: noFinals }, server.url))).message).toMatch(
      /^not final: shield: no final record/,
    );
    expect(server.requests).toEqual([]);
  });

  it("counts a ceremony already sealed with this beacon and these finals as done", async () => {
    const c = await syntheticCeremony();
    const published = await readFile(layout(c.dir).transcript);
    const done = await coordinator(finalized, {
      [`/artifacts/${CEREMONY_LAYOUT.transcript}`]: serve(published),
    });
    expect(await publish(c, done.url)).toBe(c.transcript.records.at(-1)?.chain);

    const other: Transcript = JSON.parse(String(published));
    (other.finals[0] as { vk_hash: string | null }).vk_hash = `0x${"ab".repeat(32)}`;
    const elsewhere = await coordinator(finalized, {
      [`/artifacts/${CEREMONY_LAYOUT.transcript}`]: serve(serializeJson(other)),
    });
    expect((await rejection(publish(c, elsewhere.url))).message).toBe(
      "the coordinator is finalized with another beacon or other finals",
    );
  });

  it("stops at a refusal or a stored key other than the one sent", async () => {
    const c = await syntheticCeremony();
    const refusing = await coordinator((_q, res) =>
      json(res, 409, { error: { code: "not-finalizable", message: "moved" } }),
    );
    expect((await rejection(publish(c, refusing.url))).message).toMatch(
      /^POST \/admin\/finalize: 409 .*not-finalizable/,
    );
    const wrongKey = await localServer({
      "*": (_q, res) => json(res, 201, { ok: true, key: "x" }),
    });
    servers.push(wrongKey);
    expect((await rejection(publish(c, wrongKey.url))).message).toBe(
      "PUT final/shield.final.zkey: the coordinator stored another key",
    );
    expect(wrongKey.requests).toHaveLength(1);
  });
});
