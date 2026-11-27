/**
 * Session attestations: signed by the linked wallet (EIP-712 or sr25519), covering exactly the
 * session's accepted records, once; anything else changes neither the records nor the slot.
 */
import { runDurableObjectAlarm } from "cloudflare:test";
import { env } from "cloudflare:workers";
import {
  type AttestationPayload,
  type Chained,
  type ContributionRecord,
} from "@orbinum-ceremony/core";
import { Wallet } from "ethers";
import { beforeEach, describe, expect, it } from "vitest";
import {
  call,
  claimOf,
  clearBuckets,
  freshId,
  json,
  linkDirect,
  polkadotPair,
  readTranscript,
  refusal,
  routedTo,
  appWith,
  setupInput,
  signAttestationEvm,
  signPolkadot,
  stubOf,
  validReport,
  verifierCall,
} from "../../../support";

const ALICE = 301;

async function withContribution(githubId = ALICE) {
  const name = freshId("attest");
  const stub = stubOf(name);
  await stub.configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
  await runDurableObjectAlarm(stub);
  const wallet = await linkDirect(stub, githubId);
  const as = { ceremony: name };
  for (const path of ["/api/queue/join", "/api/session/claim"]) {
    expect((await call("POST", path, githubId, as)).status).toBe(200);
  }
  const head = await json(await call("GET", "/api/session/head/shield", githubId, as));
  const bytes = new TextEncoder().encode(`contribution of ${name}`);
  const r = await appWith(routedTo(name), "http://localhost/api/session/upload/shield", {
    method: "PUT",
    headers: {
      "x-dev-github-id": String(githubId),
      "x-ceremony-claim": JSON.stringify(claimOf(bytes, head.output_sha256 as string)),
      "content-length": String(bytes.length),
    },
    body: bytes,
  });
  const { job } = await json(r);
  await verifierCall("POST", "/internal/verifications", validReport(job), as);
  return { stub, as, wallet, seq: job.seq as number };
}

async function payloadOf(
  stub: ReturnType<typeof stubOf>,
  githubId: number,
  account: string,
  seq: number,
): Promise<AttestationPayload> {
  const accepted = (await readTranscript(stub)).records.filter(
    (x): x is Chained<ContributionRecord> => x.type === "contribution" && x.seq === seq,
  );
  return {
    ceremony_id: env.CEREMONY_ID,
    github_id: githubId,
    account,
    seq,
    contributions: accepted.map((r) => ({
      circuit: r.circuit,
      index: r.index,
      input_sha256: r.input_sha256,
      output_sha256: r.output_sha256,
      contribution_hash: r.contribution_hash,
    })),
    client: { name: "orbinum-ceremony", version: "0.1.0", commit: "abc1234" },
  };
}

const attest = (as: { ceremony: string }, githubId: number, body: unknown) =>
  call("POST", "/api/session/attest", githubId, { ...as, body });

const stateOf = async (stub: ReturnType<typeof stubOf>) => ({
  records: (await readTranscript(stub)).records,
  slot: (await stub.snapshot())?.slot,
});

beforeEach(clearBuckets);

describe("attestation by an EIP-712 wallet", () => {
  it("closes the session with an attestation of exactly its accepted records, once", async () => {
    const { stub, as, wallet, seq } = await withContribution();
    const payload = await payloadOf(stub, ALICE, wallet.address, seq);
    const empty = { ...payload, contributions: [] };
    const malformed = await attest(as, ALICE, {
      payload: empty,
      signature: await signAttestationEvm(wallet, empty),
    });
    expect(await refusal(malformed)).toEqual([400, "malformed"]);

    const signature = await signAttestationEvm(wallet, payload);
    expect(await json(await attest(as, ALICE, { payload, signature }))).toEqual({ ok: true });
    expect(await refusal(await attest(as, ALICE, { payload, signature }))).toEqual([
      409,
      "already-attested",
    ]);
    expect((await stub.snapshot())?.slot).toBeNull();
    const last = (await readTranscript(stub)).records.at(-1);
    expect(last).toMatchObject({ type: "attestation", seq, scheme: "eip712" });

    const receipt = await json(await call("GET", `/api/receipt/${seq}`, undefined, as));
    expect(receipt.records.map((r: { type: string }) => r.type)).toEqual([
      "contribution",
      "attestation",
    ]);
    expect(receipt.records.at(-1).chain).toBe(last?.chain);
  });

  it("refuses an attestation signed by another wallet, and changes nothing", async () => {
    const { stub, as, wallet, seq } = await withContribution();
    const payload = await payloadOf(stub, ALICE, wallet.address, seq);
    const before = await stateOf(stub);
    const forged = await signAttestationEvm(Wallet.createRandom(), payload);
    expect(await refusal(await attest(as, ALICE, { payload, signature: forged }))).toEqual([
      401,
      "invalid-signature",
    ]);
    expect(await stateOf(stub)).toEqual(before);
    expect(before.slot).not.toBeNull();
  });

  it("refuses an attestation naming other contribution hashes, and changes nothing", async () => {
    const { stub, as, wallet, seq } = await withContribution();
    const payload = await payloadOf(stub, ALICE, wallet.address, seq);
    const [first] = payload.contributions;
    const changed = {
      ...payload,
      contributions: [{ ...first!, contribution_hash: "ff".repeat(64) }],
    };
    const before = await stateOf(stub);
    const r = await attest(as, ALICE, {
      payload: changed,
      signature: await signAttestationEvm(wallet, changed),
    });
    expect(await refusal(r)).toEqual([409, "attestation-mismatch"]);
    expect(await stateOf(stub)).toEqual(before);
  });

  it("refuses an oversized attestation before reading it", async () => {
    const { stub, as } = await withContribution();
    const before = await stateOf(stub);
    const big = await attest(as, ALICE, { payload: "x".repeat(70_000), signature: "0x" });
    expect(await refusal(big)).toEqual([413, "too-large"]);
    expect(await stateOf(stub)).toEqual(before);
  });
});

describe("attestation by an sr25519 wallet, after the session ended", () => {
  const BOB = 302;

  it("records the signed payload and changes nothing else", async () => {
    const pair = await polkadotPair("sr25519");
    const name = freshId("attest-sr25519");
    const as = { ceremony: name };
    const stub = stubOf(name);
    await stub.configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
    await runDurableObjectAlarm(stub);
    const { nonce } = await json(await call("POST", "/api/link/nonce", BOB, as));
    const link = {
      ceremony_id: env.CEREMONY_ID,
      github_id: BOB,
      github_login: `user-${BOB}`,
      account: pair.address,
      nonce,
      issued_at: Math.floor(Date.now() / 1000),
    };
    const linked = await call("POST", "/api/link", BOB, {
      ...as,
      body: { scheme: "sr25519", payload: link, signature: signPolkadot(pair, "link", link) },
    });
    expect(linked.status).toBe(200);
    for (const path of ["/api/queue/join", "/api/session/claim"]) {
      expect((await call("POST", path, BOB, as)).status).toBe(200);
    }
    const head = await json(await call("GET", "/api/session/head/shield", BOB, as));
    const bytes = new TextEncoder().encode("bob's contribution");
    const r = await appWith(routedTo(name), "http://localhost/api/session/upload/shield", {
      method: "PUT",
      headers: {
        "x-dev-github-id": String(BOB),
        "x-ceremony-claim": JSON.stringify(claimOf(bytes, head.output_sha256 as string)),
        "content-length": String(bytes.length),
      },
      body: bytes,
    });
    const { job } = await json(r);
    await verifierCall("POST", "/internal/verifications", validReport(job), as);
    expect((await call("POST", "/api/session/finish", BOB, as)).status).toBe(200);

    const payload = await payloadOf(stub, BOB, pair.address, job.seq);
    const before = (await readTranscript(stub)).records.length;
    const forged = await attest(as, BOB, {
      payload,
      signature: signPolkadot(await polkadotPair("sr25519"), "attestation", payload),
    });
    expect(await refusal(forged)).toEqual([401, "invalid-signature"]);
    expect((await readTranscript(stub)).records).toHaveLength(before);

    const ok = await attest(as, BOB, {
      payload,
      signature: signPolkadot(pair, "attestation", payload),
    });
    expect(ok.status).toBe(200);
    const after = (await readTranscript(stub)).records;
    expect(after).toHaveLength(before + 1);
    expect(after.at(-1)).toMatchObject({ type: "attestation", seq: job.seq, scheme: "sr25519" });
  });

  it("refuses an attestation from an identity without a wallet", async () => {
    const r = await attest({ ceremony: freshId("attest-none") }, 999, {
      payload: {},
      signature: "0x",
    });
    expect(await refusal(r)).toEqual([403, "not-linked"]);
  });
});
