/**
 * Wallet links: EIP-712 and sr25519 signatures over a fresh single-use nonce, for this identity,
 * ceremony and time; 1 GitHub = 1 wallet under every spelling; the signed payload is kept; an
 * ed25519 key or a degenerate signature is never a wallet.
 */
import { Keyring } from "@polkadot/keyring";
import { u8aToHex } from "@polkadot/util";
import { cryptoWaitReady, encodeAddress } from "@polkadot/util-crypto";
import { env } from "cloudflare:workers";
import { type LinkPayload, sr25519Message, ss58Address } from "@orbinum-ceremony/core";
import { type BaseWallet, Wallet } from "ethers";
import { beforeAll, describe, expect, it } from "vitest";
import {
  call as request,
  expireNonces,
  freshId,
  json,
  polkadotPair,
  refusal,
  setupInput,
  signLinkEvm,
  signPolkadot,
  stubOf,
} from "../../../support";

const name = freshId("link");
const call = (method: string, path: string, githubId?: number, init: { body?: unknown } = {}) =>
  request(method, path, githubId, { ceremony: name, ...init });

let gid = 1000;
const nextIdentity = () => ++gid;

async function payloadFor(githubId: number, account: string): Promise<LinkPayload> {
  const { nonce } = await json(await call("POST", "/api/link/nonce", githubId));
  return {
    ceremony_id: env.CEREMONY_ID,
    github_id: githubId,
    github_login: `user-${githubId}`,
    account,
    nonce,
    issued_at: Math.floor(Date.now() / 1000),
  };
}

const signEvm = (wallet: BaseWallet, payload: LinkPayload) => signLinkEvm(wallet, payload);

const linkWith = (githubId: number, body: unknown) => call("POST", "/api/link", githubId, { body });

describe("wallet link", () => {
  beforeAll(async () => {
    await cryptoWaitReady();
    await stubOf(name).configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
  });

  it("links an EVM wallet with EIP-712, after which the identity may queue", async () => {
    const id = nextIdentity();
    const wallet = Wallet.createRandom();
    expect(await refusal(await call("POST", "/api/queue/join", id))).toEqual([403, "not-linked"]);
    const payload = await payloadFor(id, wallet.address);
    const r = await linkWith(id, {
      scheme: "eip712",
      payload,
      signature: await signEvm(wallet, payload),
    });
    expect([r.status, await json(r)]).toEqual([200, { ok: true }]);
    expect(await json(await call("GET", "/api/link", id))).toMatchObject({
      linked: { scheme: "eip712", account: wallet.address },
    });
    expect(await stubOf(name).linked(id)).toMatchObject({
      nonce: payload.nonce,
      issuedAt: payload.issued_at,
    });
    expect((await call("POST", "/api/queue/join", id)).status).toBe(200);
  });

  it("links an sr25519 wallet, and refuses the same key under another SS58 prefix", async () => {
    const pair = new Keyring({ type: "sr25519", ss58Format: 42 }).addFromUri(`//ceremony-${gid}`);
    const id = nextIdentity();
    const payload = await payloadFor(id, pair.address);
    const signature = u8aToHex(pair.sign(sr25519Message("link", payload)));
    expect((await linkWith(id, { scheme: "sr25519", payload, signature })).status).toBe(200);

    const other = nextIdentity();
    const polkadotForm = encodeAddress(pair.publicKey, 0);
    const p2 = await payloadFor(other, polkadotForm);
    const s2 = u8aToHex(pair.sign(sr25519Message("link", p2)));
    const r = await linkWith(other, { scheme: "sr25519", payload: p2, signature: s2 });
    expect([r.status, (await json(r)).error.code]).toEqual([409, "wallet-taken"]);
  });

  it("refuses a replayed nonce, another identity's payload and a bad signature", async () => {
    const wallet = Wallet.createRandom();
    const id = nextIdentity();
    const payload = await payloadFor(id, wallet.address);
    const body = { scheme: "eip712", payload, signature: await signEvm(wallet, payload) };
    expect((await linkWith(id, body)).status).toBe(200);
    const replay = await linkWith(id, body);
    expect(await refusal(replay)).toEqual([409, "nonce-invalid"]);

    const victim = nextIdentity();
    const wrong = await linkWith(victim, body);
    expect([wrong.status, (await json(wrong)).error.code]).toEqual([403, "wrong-identity"]);

    const id2 = nextIdentity();
    const p2 = await payloadFor(id2, wallet.address);
    const forged = await linkWith(id2, {
      scheme: "eip712",
      payload: p2,
      signature: await signEvm(Wallet.createRandom(), p2),
    });
    expect([forged.status, (await json(forged)).error.code]).toEqual([401, "invalid-signature"]);
    expect(await stubOf(name).linked(victim)).toBeNull();
    expect(await stubOf(name).linked(id2)).toBeNull();
  });

  it("replaces the wallet of an identity that has not contributed, never with another's", async () => {
    const [first, second] = [Wallet.createRandom(), Wallet.createRandom()];
    const id = nextIdentity();
    const p1 = await payloadFor(id, first.address);
    await linkWith(id, { scheme: "eip712", payload: p1, signature: await signEvm(first, p1) });
    const p2 = await payloadFor(id, second.address);
    const again = await linkWith(id, {
      scheme: "eip712",
      payload: p2,
      signature: await signEvm(second, p2),
    });
    expect(again.status).toBe(200);
    expect((await stubOf(name).linked(id))?.account).toBe(second.address);
    const taker = nextIdentity();
    const p4 = await payloadFor(taker, first.address);
    const released = await linkWith(taker, {
      scheme: "eip712",
      payload: p4,
      signature: await signEvm(first, p4),
    });
    expect(released.status).toBe(200);

    const thief = nextIdentity();
    const p3 = await payloadFor(thief, second.address);
    const taken = await linkWith(thief, {
      scheme: "eip712",
      payload: p3,
      signature: await signEvm(second, p3),
    });
    expect(await refusal(taken)).toEqual([409, "wallet-taken"]);
    expect(await stubOf(name).linked(thief)).toBeNull();
  });

  it("refuses malformed bodies and stale signatures", async () => {
    const id = nextIdentity();
    expect(await refusal(await linkWith(id, { scheme: "rsa" }))).toEqual([400, "malformed"]);
    const wallet = Wallet.createRandom();
    const payload = { ...(await payloadFor(id, wallet.address)), issued_at: 1 };
    const r = await linkWith(id, {
      scheme: "eip712",
      payload,
      signature: await signEvm(wallet, payload),
    });
    expect(await refusal(r)).toEqual([400, "stale-signature"]);
    expect(await stubOf(name).linked(id)).toBeNull();
    const big = await linkWith(id, { scheme: "eip712", payload, signature: "x".repeat(70_000) });
    expect(await refusal(big)).toEqual([413, "too-large"]);
  });

  it("holds one EVM wallet under every spelling of its address", async () => {
    const wallet = Wallet.createRandom();
    const id = nextIdentity();
    const p1 = await payloadFor(id, wallet.address);
    expect(
      (await linkWith(id, { scheme: "eip712", payload: p1, signature: await signEvm(wallet, p1) }))
        .status,
    ).toBe(200);
    const other = nextIdentity();
    const p2 = await payloadFor(other, wallet.address.toLowerCase());
    const r = await linkWith(other, {
      scheme: "eip712",
      payload: p2,
      signature: await signEvm(wallet, p2),
    });
    expect([r.status, (await json(r)).error.code]).toEqual([409, "wallet-taken"]);
  });

  it("relinks the same wallet as a no-op, keeping when it was linked", async () => {
    const wallet = Wallet.createRandom();
    const id = nextIdentity();
    const p1 = await payloadFor(id, wallet.address);
    await linkWith(id, { scheme: "eip712", payload: p1, signature: await signEvm(wallet, p1) });
    const before = (await json(await call("GET", "/api/link", id))).linked.linkedAt;
    const p2 = await payloadFor(id, wallet.address);
    expect(
      (await linkWith(id, { scheme: "eip712", payload: p2, signature: await signEvm(wallet, p2) }))
        .status,
    ).toBe(200);
    expect((await json(await call("GET", "/api/link", id))).linked.linkedAt).toBe(before);
  });

  it("refuses an expired nonce, another identity's nonce, and another ceremony", async () => {
    const wallet = Wallet.createRandom();
    const id = nextIdentity();
    const expired = await payloadFor(id, wallet.address);
    await expireNonces(stubOf(name));
    const r1 = await linkWith(id, {
      scheme: "eip712",
      payload: expired,
      signature: await signEvm(wallet, expired),
    });
    expect([r1.status, (await json(r1)).error.code]).toEqual([409, "nonce-invalid"]);

    const owner = nextIdentity();
    const { nonce } = await json(await call("POST", "/api/link/nonce", owner));
    const borrowed = { ...(await payloadFor(id, wallet.address)), nonce };
    const r2 = await linkWith(id, {
      scheme: "eip712",
      payload: borrowed,
      signature: await signEvm(wallet, borrowed),
    });
    expect(await refusal(r2)).toEqual([409, "nonce-invalid"]);

    const foreign = { ...(await payloadFor(id, wallet.address)), ceremony_id: "mainnet-1" };
    const r3 = await linkWith(id, {
      scheme: "eip712",
      payload: foreign,
      signature: await signEvm(wallet, foreign),
    });
    expect([r3.status, (await json(r3)).error.code]).toEqual([403, "wrong-identity"]);
    expect(await stubOf(name).linked(id)).toBeNull();
  });

  it("accepts an sr25519 signature over <Bytes>, and refuses an ed25519 one", async () => {
    const sr = await polkadotPair("sr25519");
    const id = nextIdentity();
    const p1 = await payloadFor(id, sr.address);
    const wrapped = signPolkadot(sr, "link", p1, true);
    expect(
      (await linkWith(id, { scheme: "sr25519", payload: p1, signature: wrapped })).status,
    ).toBe(200);

    const ed = await polkadotPair("ed25519");
    const other = nextIdentity();
    const p2 = await payloadFor(other, ed.address);
    const r = await linkWith(other, {
      scheme: "sr25519",
      payload: p2,
      signature: signPolkadot(ed, "link", p2),
    });
    expect([r.status, (await json(r)).error.code]).toEqual([401, "invalid-signature"]);
  });

  it("links an ed25519 account (a Solana wallet, a Ledger) signing bare or <Bytes>", async () => {
    const linked = await Promise.all(
      [false, true].map(async (wrapped) => {
        const ed = await polkadotPair("ed25519");
        const id = nextIdentity();
        const p = await payloadFor(id, ed.address);
        const signature = signPolkadot(ed, "link", p, wrapped);
        return (await linkWith(id, { scheme: "ed25519", payload: p, signature })).status;
      }),
    );
    expect(linked).toEqual([200, 200]);
    const sr = await polkadotPair("sr25519");
    const other = nextIdentity();
    const p2 = await payloadFor(other, sr.address);
    const r = await linkWith(other, {
      scheme: "ed25519",
      payload: p2,
      signature: signPolkadot(sr, "link", p2),
    });
    expect([
      ["400", "malformed"],
      ["401", "invalid-signature"],
    ]).toContainEqual([String(r.status), (await json(r)).error.code]);
  });

  it("refuses a keyless ed25519 'wallet' whose small-order key verifies any message", async () => {
    const keyless = Uint8Array.from([1, ...Array<number>(31).fill(0)]);
    const id = nextIdentity();
    const p = await payloadFor(id, ss58Address(keyless));
    const signature = `0x01${"00".repeat(63)}`;
    expect(await refusal(await linkWith(id, { scheme: "ed25519", payload: p, signature }))).toEqual(
      [400, "malformed"],
    );
  });

  it("refuses an account of the other scheme, and signatures of the wrong size", async () => {
    const sr = await polkadotPair("sr25519");
    const id = nextIdentity();
    const p1 = await payloadFor(id, sr.address);
    const r1 = await linkWith(id, {
      scheme: "eip712",
      payload: p1,
      signature: `0x${"12".repeat(65)}`,
    });
    expect(await refusal(r1)).toEqual([400, "malformed"]);
    const wallet = Wallet.createRandom();
    const p2 = await payloadFor(id, wallet.address);
    for (const signature of [`0x${"12".repeat(63)}`, "not hex"]) {
      const r = await linkWith(id, { scheme: "eip712", payload: p2, signature });
      expect([r.status, (await json(r)).error.code]).toEqual([400, "malformed"]);
    }
  });
});
