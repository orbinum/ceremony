/**
 * Request validators (COORDINATOR §3): route parameters, artifact keys, upload claims and
 * lengths, operator files and JSON bodies are refused as `malformed` before a handler runs.
 */
import { MAX_CLAIM_BYTES, MAX_FILE_BYTES } from "@orbinum-ceremony/core";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../../src/env";
import {
  artifactKey,
  circuitParam,
  jobIdParam,
  linkRequest,
  onError,
  publicFileInput,
  seqParam,
  uploadInput,
} from "../../src/http";

/** Each validator in front of an echo of what it validated. */
const app = new Hono<AppEnv>()
  .get("/circuit/:circuit", circuitParam, (c) => c.json(c.req.valid("param")))
  .get("/seq/:seq", seqParam, (c) => c.json(c.req.valid("param")))
  .get("/job/:seq/:circuit/:attempt", jobIdParam, (c) => c.json(c.req.valid("param")))
  .get("/artifacts/*", artifactKey, (c) => c.json(c.req.valid("param")))
  .put("/upload", uploadInput, (c) => c.json({ size: c.req.valid("header").size }))
  .put("/admin/artifacts/*", publicFileInput, (c) => {
    const { key, sha256, size } = c.req.valid("header");
    return c.json({ key, sha256, size });
  })
  .post("/link", linkRequest, (c) => c.json(c.req.valid("json")))
  .onError(onError);

const get = (path: string) => app.request(path);
const error = async (r: Response): Promise<[number, { code: string; message: string }]> => [
  r.status,
  ((await r.json()) as { error: { code: string; message: string } }).error,
];

const putUpload = (headers: Record<string, string>) =>
  app.request("/upload", { method: "PUT", headers, body: "xyz" });

const putSetupFile = (key: string, headers: Record<string, string>) =>
  app.request(`/admin/artifacts/${key}`, {
    method: "PUT",
    headers: { "content-length": "1", ...headers },
    body: "x",
  });

const postLink = (body: string, type = "application/json") =>
  app.request("/link", { method: "POST", headers: { "content-type": type }, body });

describe("request validators", () => {
  it("accept the pinned circuits, decimal ids and job ids only", async () => {
    expect(await (await get("/circuit/shield")).json()).toEqual({ circuit: "shield" });
    expect(await error(await get("/circuit/nope"))).toEqual([
      400,
      { code: "malformed", message: "unknown circuit" },
    ]);
    expect(await (await get("/seq/12")).json()).toEqual({ seq: 12 });
    for (const seq of ["01", "-1", "abc"]) {
      // oxlint-disable-next-line no-await-in-loop -- one case at a time
      expect((await get(`/seq/${seq}`)).status).toBe(400);
    }
    expect(await (await get("/job/1/shield/2")).json()).toEqual({
      seq: 1,
      circuit: "shield",
      attempt: 2,
    });
    expect((await get("/job/1/shield/0")).status).toBe(400);
  });

  it("decode artifact keys, and treat what is not one as not found", async () => {
    expect(await (await get("/artifacts/r1cs/shield.r1cs")).json()).toEqual({
      key: "r1cs/shield.r1cs",
    });
    for (const path of ["/artifacts/", "/artifacts/%E0%A4%A"]) {
      // oxlint-disable-next-line no-await-in-loop -- one case at a time
      expect((await error(await get(path)))[0]).toBe(404);
    }
  });

  it("read an upload's claim and length, with the reason of a refusal", async () => {
    const claim = JSON.stringify({
      inputSha256: "aa".repeat(32),
      outputSha256: "bb".repeat(32),
      contributionHash: "cc".repeat(64),
      method: "cli",
      client: { name: "c", version: "1", commit: "abc1234" },
    });
    expect(
      await (await putUpload({ "x-ceremony-claim": claim, "content-length": "3" })).json(),
    ).toEqual({
      size: 3,
    });
    expect(await error(await putUpload({ "content-length": "3" }))).toEqual([
      400,
      { code: "malformed", message: "missing or malformed x-ceremony-claim" },
    ]);
    // A claim one byte over the bound is refused before it is parsed, even if it is valid JSON.
    const padded = `{${" ".repeat(MAX_CLAIM_BYTES + 1 - claim.length)}${claim.slice(1)}`;
    expect(
      await error(await putUpload({ "x-ceremony-claim": padded, "content-length": "3" })),
    ).toEqual([400, { code: "malformed", message: "missing or malformed x-ceremony-claim" }]);
    const fits = padded.replace("{ ", "{");
    expect((await putUpload({ "x-ceremony-claim": fits, "content-length": "3" })).status).toBe(200);
    expect(
      await error(
        await putUpload({
          "x-ceremony-claim": claim,
          "content-length": String(MAX_FILE_BYTES + 1),
        }),
      ),
    ).toEqual([400, { code: "malformed", message: "a body with Content-Length is required" }]);
    expect(await error(await putUpload({ "x-ceremony-claim": claim }))).toEqual([
      400,
      { code: "malformed", message: "a body with Content-Length is required" },
    ]);
  });

  it("read a setup or final file's key and hash, in that order", async () => {
    for (const key of ["transcript.json", "contributions/shield/1.zkey", "final/nope.vk.json"]) {
      // oxlint-disable-next-line no-await-in-loop -- one key at a time
      expect(await error(await putSetupFile(key, { "x-content-sha256": "ab".repeat(32) }))).toEqual(
        [400, { code: "malformed", message: `not a setup or final file: ${key}` }],
      );
    }
    expect(
      await (
        await putSetupFile("final/shield.vk.json", { "x-content-sha256": "ab".repeat(32) })
      ).json(),
    ).toEqual({ key: "final/shield.vk.json", sha256: "ab".repeat(32), size: 1 });
    expect(
      (await error(await putSetupFile("ceremony.json", { "x-content-sha256": "nothex" })))[1]
        .message,
    ).toBe("x-content-sha256 is required");
    expect(
      await (await putSetupFile("ceremony.json", { "x-content-sha256": "AB".repeat(32) })).json(),
    ).toEqual({
      key: "ceremony.json",
      sha256: "ab".repeat(32),
      size: 1,
    });
  });

  it("refuse a JSON body that is not one, or not of its shape", async () => {
    const answers = await Promise.all([
      postLink("{not json"),
      postLink("{}"),
      postLink('{"scheme":"eip712"}', "text/plain"),
    ]);
    const errors = await Promise.all(answers.map(error));
    for (const e of errors) expect(e).toEqual([400, { code: "malformed", message: "malformed" }]);
  });
});
