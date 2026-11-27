/**
 * A streamed upload through the routes: refused out of order or as other bytes, otherwise verified
 * by HMAC-authenticated verifier calls, published as the new head with its log, transcript and
 * status, and recorded with the contributor's link payload.
 */
import { runDurableObjectAlarm } from "cloudflare:test";
import {
  type ContributionRecord,
  sha256Hex,
  validateTranscript,
  verifyChain,
} from "@orbinum-ceremony/core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  appWith,
  call,
  claimOf,
  clearBuckets,
  freshId,
  GENESIS_SHA256,
  json,
  linkDirect,
  LOG,
  PRIVATE,
  readTranscript,
  refusal,
  routedTo,
  setupInput,
  stubOf,
  validReport,
  verifierCall,
} from "../../../support";

const ALICE = 301;
const SETUP = setupInput(Date.now() - 1000, Date.now() + 86_400_000);

async function inSession() {
  const name = freshId("upload");
  const stub = stubOf(name);
  await stub.configure(SETUP);
  await runDurableObjectAlarm(stub);
  const wallet = await linkDirect(stub, ALICE);
  for (const path of ["/api/queue/join", "/api/session/claim"]) {
    expect((await call("POST", path, ALICE, { ceremony: name })).status).toBe(200);
  }
  return { name, stub, wallet };
}

const upload = (name: string, circuit: string, bytes: Uint8Array, claim: unknown) =>
  appWith(routedTo(name), `http://localhost/api/session/upload/${circuit}`, {
    method: "PUT",
    headers: {
      "x-dev-github-id": String(ALICE),
      "x-dev-github-login": `user-${ALICE}`,
      "x-ceremony-claim": JSON.stringify(claim),
      "content-length": String(bytes.length),
    },
    body: bytes,
  });

beforeEach(clearBuckets);

describe("upload and verification", () => {
  it("streams a 1 MiB upload, verifies it and publishes the new head", async () => {
    const { name, stub, wallet } = await inSession();
    const as = { ceremony: name };
    expect(await json(await call("GET", "/api/session/head/shield", ALICE, as))).toEqual({
      index: 0,
      output_sha256: GENESIS_SHA256.shield,
      url: "/artifacts/genesis/shield.genesis.zkey",
    });

    const big = new Uint8Array(2 ** 20);
    crypto.getRandomValues(big.subarray(0, 65536));
    const claim = claimOf(big, GENESIS_SHA256.shield);
    const early = await upload(name, "unshield", big, claimOf(big, GENESIS_SHA256.unshield));
    expect(await refusal(early)).toEqual([409, "out-of-order"]);
    const tampered = await upload(name, "shield", big, { ...claim, outputSha256: "00".repeat(32) });
    expect(await refusal(tampered)).toEqual([400, "malformed"]);
    expect((await PRIVATE.list({ prefix: "verify/" })).objects).toEqual([]);

    const r = await upload(name, "shield", big, claim);
    expect(r.status).toBe(202);
    const { job } = await json(r);
    expect(job).toEqual({ seq: 1, circuit: "shield", attempt: 1, index: 1 });
    expect(await json(await call("GET", "/api/session/result/shield", ALICE, as))).toMatchObject({
      status: "pending",
    });

    const path = "/internal/objects/1/shield/1";
    expect(await refusal(await call("GET", path, undefined, as))).toEqual([401, "unauthenticated"]);
    const object = await verifierCall("GET", path, undefined, as);
    expect(sha256Hex(new Uint8Array(await object.arrayBuffer()))).toBe(claim.outputSha256);

    const callback = await verifierCall("POST", "/internal/verifications", validReport(job), as);
    expect(await json(callback)).toEqual({ ok: true, status: "applied" });
    expect(await json(await call("GET", "/api/session/result/shield", ALICE, as))).toMatchObject({
      status: "valid",
    });

    const published = await call("GET", "/artifacts/contributions/shield/1.zkey");
    expect(sha256Hex(new Uint8Array(await published.arrayBuffer()))).toBe(claim.outputSha256);
    expect((await PRIVATE.list({ prefix: "verify/" })).objects).toEqual([]);
    expect(await json(await call("GET", "/api/session/head/shield", ALICE, as))).toMatchObject({
      index: 1,
      output_sha256: claim.outputSha256,
    });

    expect(await (await call("GET", "/artifacts/logs/shield/1.log")).text()).toBe(LOG);
    const publicTranscript = validateTranscript(
      await json(await call("GET", "/artifacts/transcript.json")),
    );
    expect(publicTranscript.anchor).toEqual({
      file: "ceremony.json",
      sha256: sha256Hex(new TextEncoder().encode(SETUP.announcement)),
    });
    expect(await json(await call("GET", "/artifacts/status.json"))).toMatchObject({
      phase: "OPEN",
      heads: { shield: { index: 1, output_sha256: claim.outputSha256 } },
      head_chain: publicTranscript.records.at(-1)?.chain,
    });

    const transcript = await readTranscript(stub);
    expect(publicTranscript.records).toEqual(transcript.records);
    expect(verifyChain(transcript.records, transcript.chainGenesis).ok).toBe(true);
    const record = transcript.records.find((x) => x.type === "contribution") as ContributionRecord;
    const linked = await stub.linked(ALICE);
    expect(record).toMatchObject({
      seq: 1,
      circuit: "shield",
      index: 1,
      input_sha256: GENESIS_SHA256.shield,
      output_sha256: claim.outputSha256,
      identity: {
        github_id: ALICE,
        account: wallet.address,
        scheme: "eip712",
        nonce: linked?.nonce,
        issued_at: linked?.issuedAt,
      },
    });
  });
});
