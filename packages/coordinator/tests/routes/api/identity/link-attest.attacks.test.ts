/**
 * Attacks on wallet links, nonces, wallet uniqueness (under every address spelling) and attestations
 * through the Worker and the Durable Object.
 */
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import {
  type AttestationPayload,
  buildContributionRecord,
  type Chained,
  type ContributionRecord,
  contributorOf,
  type LinkPayload,
  linkPayloadOf,
  verifyLink,
} from "@orbinum-ceremony/core";
import { Signature, Wallet } from "ethers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as db from "../../../../src/durable/db";
import {
  appWith,
  call as request,
  claimOf,
  clearBuckets,
  freshId,
  json,
  linkDirect,
  polkadotPair,
  readTranscript,
  refusal,
  routedTo,
  setQueue,
  setupInput,
  signAttestationEvm,
  signLinkEvm,
  signPolkadot,
  stubOf,
  validReport,
  verifierCall,
} from "../../../support";

const name = freshId("link-attacks");
const call = (
  method: string,
  path: string,
  githubId?: number,
  init: { body?: unknown; login?: string } = {},
) => request(method, path, githubId, { ceremony: name, ...init });

let gid = 7000;
const nextIdentity = () => ++gid;

async function payloadFor(
  githubId: number,
  account: string,
  login = `user-${githubId}`,
): Promise<LinkPayload> {
  const { nonce } = await json(await call("POST", "/api/link/nonce", githubId, { login }));
  return {
    ceremony_id: env.CEREMONY_ID,
    github_id: githubId,
    github_login: login,
    account,
    nonce,
    issued_at: Math.floor(Date.now() / 1000),
  };
}

const linkWith = (githubId: number, body: unknown, login?: string) =>
  call("POST", "/api/link", githubId, { body, ...(login ? { login } : {}) });

describe("link races and nonces", () => {
  beforeAll(async () => {
    await stubOf(name).configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
  });

  it("binds exactly one wallet when two links race on the same nonce", async () => {
    const id = nextIdentity();
    const [a, b] = [Wallet.createRandom(), Wallet.createRandom()];
    const base = await payloadFor(id, a.address);
    const pb = { ...base, account: b.address };
    const rs = await Promise.all([
      linkWith(id, { scheme: "eip712", payload: base, signature: await signLinkEvm(a, base) }),
      linkWith(id, { scheme: "eip712", payload: pb, signature: await signLinkEvm(b, pb) }),
    ]);
    const statuses = rs.map((r) => r.status).toSorted();
    expect(statuses).toEqual([200, 409]);
    const linked = await stubOf(name).linked(id);
    expect([a.address, b.address]).toContain(linked?.account);
  });

  it("lets exactly one of two identities racing for one wallet hold it", async () => {
    const w = Wallet.createRandom();
    const [x, y] = [nextIdentity(), nextIdentity()];
    const [px, py] = [await payloadFor(x, w.address), await payloadFor(y, w.address)];
    const rs = await Promise.all([
      linkWith(x, { scheme: "eip712", payload: px, signature: await signLinkEvm(w, px) }),
      linkWith(y, { scheme: "eip712", payload: py, signature: await signLinkEvm(w, py) }),
    ]);
    expect(rs.map((r) => r.status).toSorted()).toEqual([200, 409]);
    const holders = [await stubOf(name).linked(x), await stubOf(name).linked(y)].filter(Boolean);
    expect(holders).toHaveLength(1);
  });

  it("kills a nonce at exactly its expiry and keeps it alive one ms before", async () => {
    const id = nextIdentity();
    const issued = await stubOf(name).issueNonce(id);
    if (!issued.ok) throw new Error("nonce");
    await runInDurableObject(stubOf(name), (_, state) => {
      expect(db.consumeNonce(state.storage.sql, issued.nonce, id, issued.expiresAt)).toBe(false);
      expect(db.consumeNonce(state.storage.sql, issued.nonce, id + 1, issued.expiresAt - 1)).toBe(
        false,
      );
      expect(db.consumeNonce(state.storage.sql, issued.nonce, id, issued.expiresAt - 1)).toBe(true);
      expect(db.consumeNonce(state.storage.sql, issued.nonce, id, issued.expiresAt - 1)).toBe(
        false,
      );
    });
  });

  it("keeps at most five live nonces per identity", async () => {
    const id = nextIdentity();
    for (let i = 0; i < 300; i++) {
      await stubOf(name).issueNonce(id);
    }
    const n = await runInDurableObject(
      stubOf(name),
      (_, state) =>
        state.storage.sql.exec("SELECT COUNT(*) AS n FROM nonces WHERE github_id = ?", id).one().n,
    );
    expect(n).toBe(5);
  });

  it("takes issued_at from the client's clock within ±10 min, not from the nonce's issue time", async () => {
    const w = Wallet.createRandom();
    const id = nextIdentity();
    const p = {
      ...(await payloadFor(id, w.address)),
      issued_at: Math.floor(Date.now() / 1000) + 540,
    };
    const r = await linkWith(id, {
      scheme: "eip712",
      payload: p,
      signature: await signLinkEvm(w, p),
    });
    expect(r.status).toBe(200);
    const id2 = nextIdentity();
    const w2 = Wallet.createRandom();
    const late = {
      ...(await payloadFor(id2, w2.address)),
      issued_at: Math.floor(Date.now() / 1000) + 660,
    };
    const r2 = await linkWith(id2, {
      scheme: "eip712",
      payload: late,
      signature: await signLinkEvm(w2, late),
    });
    expect(await refusal(r2)).toEqual([400, "stale-signature"]);
  });

  it("refuses a link signature submitted under the attestation route", async () => {
    const id = nextIdentity();
    const w = await linkDirect(stubOf(name), id);
    const p = await payloadFor(id, w.address);
    const r = await call("POST", "/api/session/attest", id, {
      body: { payload: p, signature: await signLinkEvm(w as Wallet, p) },
    });
    expect(await refusal(r)).toEqual([400, "malformed"]);
  });
});

describe("spellings and what reaches the transcript", () => {
  const ceremonyName = freshId("link-attacks-spell");
  const c2 = (
    method: string,
    path: string,
    githubId?: number,
    init: { body?: unknown; login?: string } = {},
  ) => request(method, path, githubId, { ceremony: ceremonyName, ...init });
  const fresh = async (githubId: number, account: string, login = `user-${githubId}`) => {
    const { nonce } = await json(await c2("POST", "/api/link/nonce", githubId, { login }));
    return {
      ceremony_id: env.CEREMONY_ID,
      github_id: githubId,
      github_login: login,
      account,
      nonce,
      issued_at: Math.floor(Date.now() / 1000),
    } satisfies LinkPayload;
  };

  beforeAll(async () => {
    await stubOf(ceremonyName).configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
  });

  const recordFor = async (githubId: number) => {
    const linked = await stubOf(ceremonyName).linked(githubId);
    if (!linked) throw new Error("not linked");
    return buildContributionRecord({
      ceremonyId: env.CEREMONY_ID,
      seq: 1,
      circuit: "shield",
      index: 1,
      claimed: {
        inputSha256: "11".repeat(32),
        outputSha256: "22".repeat(32),
        contributionHash: "33".repeat(64),
        method: "cli",
        client: { name: "c", version: "1", commit: "abc1234" },
      },
      verified: {
        contributionHash: "33".repeat(64),
        zkeyName: "n",
        deltaAfter: "44".repeat(64),
        logSha256: "55".repeat(32),
        verifierVersion: "0.1.0",
        snarkjsVersion: "0.7.6",
      },
      contributor: contributorOf(linked),
      at: new Date().toISOString(),
    });
  };

  it("builds records that re-verify from an uppercase account, a v=0 uppercase signature and EIP-2098", async () => {
    const w = Wallet.createRandom();
    const id = nextIdentity();
    const upper = `0x${w.address.slice(2).toUpperCase()}`;
    const p = await fresh(id, upper);
    const sig = Signature.from(await signLinkEvm(w, p));
    const v0 = `0x${sig.serialized.slice(2, 130).toUpperCase()}${(sig.v - 27).toString(16).padStart(2, "0")}`;
    expect(
      (await c2("POST", "/api/link", id, { body: { scheme: "eip712", payload: p, signature: v0 } }))
        .status,
    ).toBe(200);
    const rec = await recordFor(id);
    expect(verifyLink("eip712", linkPayloadOf(rec.ceremony_id, rec.identity!), rec.link_sig!)).toBe(
      true,
    );

    const w2 = Wallet.createRandom();
    const id2 = nextIdentity();
    const p2 = await fresh(id2, w2.address);
    const compact = Signature.from(await signLinkEvm(w2, p2)).compactSerialized;
    expect(
      (
        await c2("POST", "/api/link", id2, {
          body: { scheme: "eip712", payload: p2, signature: compact },
        })
      ).status,
    ).toBe(200);
    expect((await recordFor(id2)).link_sig).toHaveLength(128);

    const id3 = nextIdentity();
    const p3 = await fresh(id3, w.address);
    const r3 = await c2("POST", "/api/link", id3, {
      body: { scheme: "eip712", payload: p3, signature: await signLinkEvm(w, p3) },
    });
    expect(await refusal(r3)).toEqual([409, "wallet-taken"]);
  });

  it("refuses the high-s twin of a link signature", async () => {
    const w = Wallet.createRandom();
    const id = nextIdentity();
    const p = await fresh(id, w.address);
    const sig = Signature.from(await signLinkEvm(w, p));
    const N = BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141");
    const twin = `0x${sig.r.slice(2)}${(N - BigInt(sig.s)).toString(16).padStart(64, "0")}${sig.v === 27 ? "1c" : "1b"}`;
    const r = await c2("POST", "/api/link", id, {
      body: { scheme: "eip712", payload: p, signature: twin },
    });
    expect(await refusal(r)).toEqual([401, "invalid-signature"]);
  });

  it("refuses an sr25519 key under prefix 42 once linked under prefix 0, and the record re-verifies", async () => {
    const pair = await polkadotPair("sr25519");
    const { encodeAddress } = await import("@polkadot/util-crypto");
    const id = nextIdentity();
    const p = await fresh(id, encodeAddress(pair.publicKey, 0));
    const sig = signPolkadot(pair, "link", p, true).toUpperCase().replace(/^0X/, "0x");
    expect(
      (
        await c2("POST", "/api/link", id, {
          body: { scheme: "sr25519", payload: p, signature: sig },
        })
      ).status,
    ).toBe(200);
    const rec = await recordFor(id);
    expect(rec.link_sig).toMatch(/^[0-9a-f]{128}$/);
    const id2 = nextIdentity();
    const p2 = await fresh(id2, encodeAddress(pair.publicKey, 42));
    const r2 = await c2("POST", "/api/link", id2, {
      body: { scheme: "sr25519", payload: p2, signature: signPolkadot(pair, "link", p2) },
    });
    expect(await refusal(r2)).toEqual([409, "wallet-taken"]);
  });

  it("keeps the signed login across a GitHub rename; another wallet replaces it, with the new login", async () => {
    const w = Wallet.createRandom();
    const id = nextIdentity();
    const p = await fresh(id, w.address, "old-name");
    expect(
      (
        await c2("POST", "/api/link", id, {
          login: "old-name",
          body: { scheme: "eip712", payload: p, signature: await signLinkEvm(w, p) },
        })
      ).status,
    ).toBe(200);
    const p2 = await fresh(id, w.address, "new-name");
    const same = await c2("POST", "/api/link", id, {
      login: "new-name",
      body: { scheme: "eip712", payload: p2, signature: await signLinkEvm(w, p2) },
    });
    expect(same.status).toBe(200);
    expect((await stubOf(ceremonyName).linked(id))?.login).toBe("old-name");
    const rec = await recordFor(id);
    expect(rec.identity?.github_login).toBe("old-name");
    const w2 = Wallet.createRandom();
    const p3 = await fresh(id, w2.address, "new-name");
    const other = await c2("POST", "/api/link", id, {
      login: "new-name",
      body: { scheme: "eip712", payload: p3, signature: await signLinkEvm(w2, p3) },
    });
    expect(other.status).toBe(200);
    const relinked = await stubOf(ceremonyName).linked(id);
    expect([relinked?.account, relinked?.login]).toEqual([w2.address, "new-name"]);
    expect((await recordFor(id)).identity?.github_login).toBe("new-name");
  });

  it("refuses a nonce once the ceremony is FINALIZED", async () => {
    const n2 = freshId("link-attacks-final");
    const stub = stubOf(n2);
    await stub.configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
    await setQueue(stub, (s) => {
      s.phase = "FINALIZED";
    });
    const r = await request("POST", "/api/link/nonce", nextIdentity(), { ceremony: n2 });
    expect(await refusal(r)).toEqual([409, "finalized"]);
  });
});

describe("changing the linked wallet", () => {
  it("is refused during the account's turn, and once a contribution names its wallet", async () => {
    const n = freshId("relink-turn");
    const stub = stubOf(n);
    await stub.configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
    await runDurableObjectAlarm(stub);
    const id = 9101;
    await linkDirect(stub, id);
    expect(await stub.changeRefusal(id)).toBeNull();
    for (const path of ["/api/queue/join", "/api/session/claim"]) {
      expect((await request("POST", path, id, { ceremony: n })).status).toBe(200);
    }
    expect(await stub.changeRefusal(id)).toBe("busy");
    await expect(linkDirect(stub, id)).rejects.toThrow("link refused: busy");

    const done = await withContribution(9102);
    expect(await done.stub.changeRefusal(9102)).toBe("already-linked");
    await expect(linkDirect(done.stub, 9102)).rejects.toThrow("link refused: already-linked");
    expect((await done.stub.linked(9102))?.account).toBe(done.wallet.address);
  });

  it("never takes a wallet another account holds, nor drops that account's link", async () => {
    const n = freshId("relink-taken");
    const stub = stubOf(n);
    await stub.configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
    const held = await linkDirect(stub, 9201);
    await linkDirect(stub, 9202);
    await expect(linkDirect(stub, 9202, held)).rejects.toThrow("link refused: wallet-taken");
    expect((await stub.linked(9201))?.account).toBe(held.address);
    expect((await stub.linked(9202))?.account).not.toBe(held.address);
  });
});

async function withContribution(githubId: number) {
  const n = freshId("attest-attacks");
  const stub = stubOf(n);
  await stub.configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
  await runDurableObjectAlarm(stub);
  const wallet = await linkDirect(stub, githubId);
  const as = { ceremony: n };
  for (const path of ["/api/queue/join", "/api/session/claim"]) {
    expect((await request("POST", path, githubId, as)).status).toBe(200);
  }
  const job = await upload(n, githubId, "shield");
  await verifierCall("POST", "/internal/verifications", validReport(job), as);
  return { stub, as, wallet, seq: job.seq as number, n };
}

async function upload(n: string, githubId: number, circuit: string) {
  const head = await json(
    await request("GET", `/api/session/head/${circuit}`, githubId, { ceremony: n }),
  );
  const bytes = new TextEncoder().encode(`contribution ${circuit} of ${n}`);
  const r = await appWith(routedTo(n), `http://localhost/api/session/upload/${circuit}`, {
    method: "PUT",
    headers: {
      "x-dev-github-id": String(githubId),
      "x-ceremony-claim": JSON.stringify(claimOf(bytes, head.output_sha256 as string)),
      "content-length": String(bytes.length),
    },
    body: bytes,
  });
  expect(r.status).toBe(202);
  return (await json(r)).job;
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
  request("POST", "/api/session/attest", githubId, { ...as, body });
const recordsOf = async (stub: ReturnType<typeof stubOf>) =>
  (await readTranscript(stub)).records.length;

describe("attestations", () => {
  beforeEach(clearBuckets);
  const ALICE = 7501;
  const BOB = 7502;
  const CAROL = 7602;
  const DAVE = 7601;

  it("refuses a wrong index, input hash or circuit (each re-signed), and changes nothing", async () => {
    const { stub, as, wallet, seq } = await withContribution(ALICE);
    const p = await payloadOf(stub, ALICE, wallet.address, seq);
    const c = p.contributions[0]!;
    const before = await recordsOf(stub);
    for (const changed of [
      { ...c, index: c.index + 1 },
      { ...c, input_sha256: "ee".repeat(32) },
      { ...c, circuit: "transfer" as const },
    ]) {
      const q = { ...p, contributions: [changed] };
      const signature = await signAttestationEvm(wallet, q);
      const r = await attest(as, ALICE, { payload: q, signature });
      expect(await refusal(r)).toEqual([409, "attestation-mismatch"]);
    }
    const extra = { ...p, contributions: [c, { ...c, circuit: "transfer" as const }] };
    const r = await attest(as, ALICE, {
      payload: extra,
      signature: await signAttestationEvm(wallet, extra),
    });
    expect(await refusal(r)).toEqual([409, "attestation-mismatch"]);
    expect(await recordsOf(stub)).toBe(before);
  });

  it("refuses another identity attesting Alice's session (own wallet or Alice's ids)", async () => {
    const { stub, as, wallet, seq } = await withContribution(ALICE);
    const bob = await linkDirect(stub, BOB);
    const asBob = await payloadOf(stub, BOB, bob.address, seq);
    const r1 = await attest(as, BOB, {
      payload: asBob,
      signature: await signAttestationEvm(bob, asBob),
    });
    expect(await refusal(r1)).toEqual([409, "attestation-mismatch"]);
    const asAlice = await payloadOf(stub, ALICE, wallet.address, seq);
    const sig = await signAttestationEvm(wallet, asAlice);
    const r2 = await attest(as, BOB, { payload: asAlice, signature: sig });
    expect((await refusal(r2))[1]).toBe("attestation-mismatch");
    expect((await stub.snapshot())?.slot?.githubId).toBe(ALICE);
  });

  it("refuses an attestation signed by an unlinked wallet naming itself", async () => {
    const { stub, as, seq } = await withContribution(ALICE);
    const other = Wallet.createRandom();
    const p = await payloadOf(stub, ALICE, other.address, seq);
    const r = await attest(as, ALICE, {
      payload: p,
      signature: await signAttestationEvm(other, p),
    });
    expect(await refusal(r)).toEqual([409, "attestation-mismatch"]);
  });

  it("refuses extra fields in the body and the payload", async () => {
    const { stub, as, wallet, seq } = await withContribution(ALICE);
    const p = await payloadOf(stub, ALICE, wallet.address, seq);
    const signature = await signAttestationEvm(wallet, p);
    expect(await refusal(await attest(as, ALICE, { payload: p, signature, extra: 1 }))).toEqual([
      400,
      "malformed",
    ]);
    expect(
      await refusal(await attest(as, ALICE, { payload: { ...p, extra: 1 }, signature })),
    ).toEqual([400, "malformed"]);
  });

  it("refuses while a verification is in flight (busy), then covers both once accepted", async () => {
    const { stub, as, wallet, seq, n } = await withContribution(CAROL);
    const job = await upload(n, CAROL, "unshield");
    const partial = await payloadOf(stub, CAROL, wallet.address, seq);
    const r = await attest(as, CAROL, {
      payload: partial,
      signature: await signAttestationEvm(wallet, partial),
    });
    expect(await refusal(r)).toEqual([409, "busy"]);
    await verifierCall("POST", "/internal/verifications", validReport(job), as);
    const stale = await attest(as, CAROL, {
      payload: partial,
      signature: await signAttestationEvm(wallet, partial),
    });
    expect(await refusal(stale)).toEqual([409, "attestation-mismatch"]);
    const full = await payloadOf(stub, CAROL, wallet.address, seq);
    expect(full.contributions).toHaveLength(2);
    expect(
      (
        await attest(as, CAROL, {
          payload: full,
          signature: await signAttestationEvm(wallet, full),
        })
      ).status,
    ).toBe(200);
  });

  it("accepts after CLOSED, refuses after FINALIZED", async () => {
    const { stub, as, wallet, seq } = await withContribution(DAVE);
    expect((await request("POST", "/api/session/finish", DAVE, as)).status).toBe(200);
    const p = await payloadOf(stub, DAVE, wallet.address, seq);
    const signature = await signAttestationEvm(wallet, p);
    await setQueue(stub, (s) => {
      s.phase = "FINALIZED";
    });
    expect(await refusal(await attest(as, DAVE, { payload: p, signature }))).toEqual([
      409,
      "finalized",
    ]);
    await setQueue(stub, (s) => {
      s.phase = "CLOSED";
    });
    expect((await attest(as, DAVE, { payload: p, signature })).status).toBe(200);
  });

  it("refuses an sr25519 link signature replayed as the attestation", async () => {
    const pair = await polkadotPair("sr25519");
    const n = freshId("attest-attacks-sr");
    const as = { ceremony: n };
    const stub = stubOf(n);
    await stub.configure(setupInput(Date.now() - 1000, Date.now() + 86_400_000));
    await runDurableObjectAlarm(stub);
    const { nonce } = await json(await request("POST", "/api/link/nonce", BOB, as));
    const link = {
      ceremony_id: env.CEREMONY_ID,
      github_id: BOB,
      github_login: `user-${BOB}`,
      account: pair.address,
      nonce,
      issued_at: Math.floor(Date.now() / 1000),
    };
    const linkSig = signPolkadot(pair, "link", link);
    expect(
      (
        await request("POST", "/api/link", BOB, {
          ...as,
          body: { scheme: "sr25519", payload: link, signature: linkSig },
        })
      ).status,
    ).toBe(200);
    for (const path of ["/api/queue/join", "/api/session/claim"]) {
      expect((await request("POST", path, BOB, as)).status).toBe(200);
    }
    const job = await upload(n, BOB, "shield");
    await verifierCall("POST", "/internal/verifications", validReport(job), as);
    const p = await payloadOf(stub, BOB, pair.address, job.seq);
    const r = await attest(as, BOB, { payload: p, signature: linkSig });
    expect(await refusal(r)).toEqual([401, "invalid-signature"]);
    const ed = await polkadotPair("ed25519");
    const r2 = await attest(as, BOB, { payload: p, signature: signPolkadot(ed, "attestation", p) });
    expect(await refusal(r2)).toEqual([401, "invalid-signature"]);
  });
});
