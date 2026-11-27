/**
 * Attacks on the upload route: hostile headers, claims, orders and paths, and verifier results aimed
 * at the wrong attempt.
 */
import { runDurableObjectAlarm } from "cloudflare:test";
import { sha256Hex } from "@orbinum-ceremony/core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  appWith,
  claimOf,
  clearBuckets,
  freshId,
  GENESIS_SHA256,
  json,
  linkDirect,
  PRIVATE,
  readTranscript,
  routedTo,
  setupInput,
  stubOf,
  UNLIMITED,
  validReport,
  verifierCall,
} from "../../../support";

const ALICE = 9101;
const BOB = 9102;
const BYTES = new TextEncoder().encode("a hostile upload");

let name = "";
beforeEach(async () => {
  await clearBuckets();
  name = freshId("upload-attacks");
  const stub = stubOf(name);
  await stub.configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
  await runDurableObjectAlarm(stub);
  await linkDirect(stub, ALICE);
  await linkDirect(stub, BOB);
  await stub.apply({ type: "join", githubId: ALICE });
  await stub.apply({ type: "claim", githubId: ALICE });
});

const put = (
  body: BodyInit | null,
  headers: Record<string, string>,
  opts: { githubId?: number; circuit?: string } = {},
) => {
  const githubId = opts.githubId ?? ALICE;
  return appWith(
    { UPLOAD_LIMIT: UNLIMITED, ...routedTo(name) },
    `http://localhost/api/session/upload/${opts.circuit ?? "shield"}`,
    {
      method: "PUT",
      headers: {
        "x-dev-github-id": String(githubId),
        "x-dev-github-login": `user-${githubId}`,
        ...(body instanceof Uint8Array ? { "content-length": String(body.length) } : {}),
        ...headers,
      },
      body,
    },
  );
};
const claimHeader = (patch: object = {}, bytes = BYTES, input = GENESIS_SHA256.shield) =>
  JSON.stringify({ ...claimOf(bytes, input), ...patch });
const status = async (r: Response) => [
  r.status,
  r.status >= 400 ? (await json(r)).error.code : "ok",
];
const privateObjects = async () => (await PRIVATE.list({ prefix: "verify/" })).objects;

describe("Content-Length", () => {
  it("refuses every non-canonical or out-of-range declared length before storing", async () => {
    for (const cl of [
      "+17",
      "-17",
      "17.0",
      "0x11",
      "1e1",
      "17,17",
      "abc",
      "99999999999999999",
      "0",
    ]) {
      const r = await put(BYTES, { "x-ceremony-claim": claimHeader(), "content-length": cl });
      expect([cl, ...(await status(r))]).toEqual([cl, 400, "malformed"]);
    }
    expect(await privateObjects()).toEqual([]);
  });

  it("reads leading zeros as the same length, the body still matching it exactly", async () => {
    const r = await put(BYTES, {
      "x-ceremony-claim": claimHeader(),
      "content-length": `000${BYTES.length}`,
    });
    expect(r.status).toBe(202);
  });

  it("refuses a length one byte over the per-index bound before reading", async () => {
    const r = await put(BYTES, {
      "x-ceremony-claim": claimHeader(),
      "content-length": String(2 ** 20 + 1024 + 1),
    });
    expect(await status(r)).toEqual([413, "too-large"]);
    expect(await privateObjects()).toEqual([]);
  });
});

describe("X-Ceremony-Claim", () => {
  it("normalizes uppercase hashes and refuses 0x, extra fields, other methods and clients", async () => {
    const bad = [
      claimHeader({ outputSha256: `0x${sha256Hex(BYTES)}` }),
      claimHeader({ extra: 1 }),
      claimHeader({ method: "web" }),
      claimHeader({ method: "CLI" }),
      claimHeader({ client: { name: "x", version: "1", commit: "abc1234", more: 1 } }),
      claimHeader({ client: { name: "x\u0000", version: "1", commit: "abc1234" } }),
      claimHeader({ contributionHash: "ab".repeat(63) }),
      `{"a":${"[".repeat(1500)}${"]".repeat(1500)}}`,
      JSON.stringify([claimOf(BYTES, GENESIS_SHA256.shield)]),
      `${claimHeader()}x`,
    ];
    for (const claim of bad) {
      expect(await status(await put(BYTES, { "x-ceremony-claim": claim }))).toEqual([
        400,
        "malformed",
      ]);
    }
    expect(await privateObjects()).toEqual([]);
    const upper = claimHeader({
      inputSha256: GENESIS_SHA256.shield.toUpperCase(),
      outputSha256: sha256Hex(BYTES).toUpperCase(),
      contributionHash: "AB".repeat(64),
    });
    const r = await put(BYTES, { "x-ceremony-claim": upper });
    expect(r.status).toBe(202);
    const job = await stubOf(name).latestJob(ALICE, "shield");
    expect(job?.claim.outputSha256).toBe(sha256Hex(BYTES));
  });

  it("takes the last of duplicate keys, as JSON.parse does, and still validates the claim", async () => {
    const claim = claimOf(BYTES, GENESIS_SHA256.shield);
    const text = claimHeader().replace(/^\{/, `{"outputSha256":"${"00".repeat(32)}",`);
    expect(JSON.parse(text).outputSha256).toBe(claim.outputSha256);
    expect((await put(BYTES, { "x-ceremony-claim": text })).status).toBe(202);
  });
});

describe("the turn", () => {
  it("refuses traversal or look-alike circuit names", async () => {
    const statuses: [string, number][] = [];
    for (const circuit of [
      "SHIELD",
      "shield%2F..",
      "%2e%2e",
      "sh%C4%B1eld",
      "shield%00",
      "constructor",
    ]) {
      const r = await put(BYTES, { "x-ceremony-claim": claimHeader() }, { circuit });
      statuses.push([circuit, r.status]);
    }
    expect(statuses).toEqual([
      ["SHIELD", 400],
      ["shield%2F..", 400],
      ["%2e%2e", 404],
      ["sh%C4%B1eld", 400],
      ["shield%00", 400],
      ["constructor", 400],
    ]);
    expect(await privateObjects()).toEqual([]);
  });

  it("refuses out of order, an accepted circuit again, and the previous head (stale-head)", async () => {
    const stub = stubOf(name);
    expect(
      await status(
        await put(
          BYTES,
          { "x-ceremony-claim": claimHeader({}, BYTES, GENESIS_SHA256.transfer) },
          { circuit: "transfer" },
        ),
      ),
    ).toEqual([409, "out-of-order"]);
    const r = await put(BYTES, { "x-ceremony-claim": claimHeader() });
    const { job } = await json(r);
    expect((await stub.report(validReport(job))).ok).toBe(true);
    const again = new TextEncoder().encode("shield again");
    expect(
      await status(
        await put(again, { "x-ceremony-claim": claimHeader({}, again, sha256Hex(BYTES)) }),
      ),
    ).toEqual([409, "out-of-order"]);
    await stub.apply({ type: "finish", githubId: ALICE });
    await stub.apply({ type: "join", githubId: BOB });
    await stub.apply({ type: "claim", githubId: BOB });
    const bob = new TextEncoder().encode("bob on an old head");
    expect(
      await status(await put(bob, { "x-ceremony-claim": claimHeader({}, bob) }, { githubId: BOB })),
    ).toEqual([409, "stale-head"]);
    expect(
      await status(await put(bob, { "x-ceremony-claim": claimHeader({}, bob, sha256Hex(BYTES)) })),
    ).toEqual([409, "not-your-slot"]);
    expect(await privateObjects()).toEqual([]);
  });

  it("refuses an upload outside a claimed slot, and while paused", async () => {
    const stub = stubOf(name);
    expect(
      await status(await put(BYTES, { "x-ceremony-claim": claimHeader() }, { githubId: BOB })),
    ).toEqual([409, "not-your-slot"]);
    await stub.applyOperator({ type: "pause" });
    expect(await status(await put(BYTES, { "x-ceremony-claim": claimHeader() }))).toEqual([
      409,
      "not-open",
    ]);
  });

  it("never applies a late result of an earlier attempt to a re-upload", async () => {
    const stub = stubOf(name);
    const r1 = await put(BYTES, { "x-ceremony-claim": claimHeader() });
    const { job: first } = await json(r1);
    await verifierCall(
      "POST",
      "/internal/verifications",
      { job: first, result: "rejected", reason: "zkey-verify-failed", detail: "x" },
      { ceremony: name },
    );
    const second = new TextEncoder().encode("second attempt");
    const r2 = await put(second, { "x-ceremony-claim": claimHeader({}, second) });
    const { job: next } = await json(r2);
    expect(next).toMatchObject({ attempt: 2, index: 1 });
    const replay = await verifierCall("POST", "/internal/verifications", validReport(first), {
      ceremony: name,
    });
    expect(await json(replay)).toEqual({ ok: true, status: "duplicate" });
    expect(await stub.latestJob(ALICE, "shield")).toMatchObject({ attempt: 2, status: "pending" });
    expect((await readTranscript(stub)).records.some((x) => x.type === "contribution")).toBe(false);
    const forged = await verifierCall(
      "POST",
      "/internal/verifications",
      validReport({ ...next, attempt: 3 }),
      { ceremony: name },
    );
    expect([forged.status, (await json(forged)).error?.code]).toEqual([404, "unknown-job"]);
  });
});
