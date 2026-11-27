/**
 * Attacks `checkIdentities` with transcripts a coordinator crafts itself: what `verify` proves
 * about who contributed, including one GitHub account per wallet across the whole transcript.
 */
import { Signature, TypedDataEncoder } from "ethers";
import { describe, expect, it } from "vitest";
import type { CircuitName } from "../../../src/config";
import {
  ethersTypedData,
  type Identity,
  linkPayloadOf,
  linkTypedData,
} from "../../../src/ceremony/identity";
import {
  buildAttestationRecord,
  buildContributionRecord,
  checkIdentities,
  type ContributionRecord,
} from "../../../src/ceremony/transcript";
import { buildAttestationPayload } from "../../../src/coordination/attestation";
import {
  ANNOUNCEMENT,
  chain,
  contributor,
  h,
  ID,
  OPEN,
  signAttestation,
  walletOf,
} from "../../support";

type Who = Identity & { linkSignature: string };

function linked(n: number, githubId: number, login: string, nonce = h(5000 + githubId)): Who {
  const identity: Identity = {
    ...contributor(n),
    github_id: githubId,
    github_login: login,
    nonce,
  };
  const typed = ethersTypedData(linkTypedData(linkPayloadOf(ID, identity)));
  const linkSignature = walletOf(n).signingKey.sign(TypedDataEncoder.hash(...typed)).serialized;
  return { ...identity, linkSignature };
}

const record = (circuit: CircuitName, index: number, seq: number, who: Who): ContributionRecord =>
  buildContributionRecord({
    ceremonyId: ID,
    seq,
    circuit,
    index,
    claimed: {
      inputSha256: h(1000 * index + 1),
      outputSha256: h(1000 * index + 2),
      contributionHash: h(index + seq * 10, 64),
      method: "browser",
      client: { name: "client", version: "1.0.0", commit: "abc1234" },
    },
    verified: {
      contributionHash: h(index + seq * 10, 64),
      zkeyName: `c-${index}`,
      deltaAfter: h(200 + index + seq, 64),
      logSha256: h(300 + index),
      verifierVersion: "0.1.0",
      snarkjsVersion: "0.7.6",
    },
    contributor: who,
    at: new Date(OPEN + seq * 60_000).toISOString(),
  });

const problemsOf = (records: Parameters<typeof chain>[0]) =>
  checkIdentities(chain(records), ANNOUNCEMENT).problems;

describe("transcript identity binding", () => {
  it("flags a link signature recorded under another account", () => {
    const alice = linked(1, 501, "alice");
    const moved = { ...alice, account: walletOf(2).address };
    expect(problemsOf([record("shield", 1, 1, moved)])).toEqual([
      "shield #1: link signature does not verify",
    ]);
  });

  it("refuses an EVM identity recorded under the sr25519 scheme", () => {
    const alice = linked(1, 501, "alice");
    expect(() => record("shield", 1, 1, { ...alice, scheme: "sr25519" })).toThrow(
      /record\.identity\.account: does not match/,
    );
  });

  it("flags one GitHub id bound to two wallets across circuits", () => {
    const a = linked(1, 501, "alice");
    const b = linked(2, 501, "alice");
    expect(problemsOf([record("transfer", 1, 1, a), record("shield", 1, 2, b)])).toEqual([
      "shield #1: GitHub id 501 with another wallet",
    ]);
  });

  it("flags one wallet bound to two GitHub ids across circuits", () => {
    const a = linked(1, 501, "alice");
    const m = linked(1, 502, "mallory");
    expect(problemsOf([record("transfer", 1, 1, a), record("shield", 1, 2, m)])).toEqual([
      "shield #1: the wallet of GitHub id 501",
    ]);
  });

  it("accepts one GitHub id under two logins and two link nonces (a renamed account)", () => {
    const a = linked(1, 501, "alice", h(1));
    const a2 = linked(1, 501, "alice-renamed", h(2));
    expect(problemsOf([record("transfer", 1, 1, a), record("shield", 1, 2, a2)])).toEqual([]);
  });

  it("does not require link nonces to be unique across identities", () => {
    const a = linked(1, 501, "alice", h(9));
    const b = linked(2, 502, "bob", h(9));
    expect(problemsOf([record("shield", 1, 1, a), record("shield", 2, 2, b)])).toEqual([]);
  });

  it("flags a session holding two identities' records", () => {
    const a = linked(1, 501, "alice");
    const b = linked(2, 502, "bob");
    const recs = [record("transfer", 1, 1, a), record("shield", 1, 1, b)];
    const payload = buildAttestationPayload({
      ceremonyId: ID,
      githubId: 501,
      account: a.account,
      seq: 1,
      records: chain(recs),
      client: { name: "web", version: "1.0.0", commit: "abc1234" },
    });
    const att = buildAttestationRecord(payload, "eip712", signAttestation(1, payload));
    const r = checkIdentities(chain([...recs, att]), ANNOUNCEMENT);
    expect(r.problems).toEqual(["shield #1: session 1 already belongs to GitHub id 501"]);
  });

  it("accepts one link signature in three spellings (v=0, v=27, EIP-2098)", () => {
    const a = linked(1, 501, "alice");
    const sig = Signature.from(a.linkSignature);
    const v0 = `${a.linkSignature.slice(0, 130)}${(sig.v - 27).toString(16).padStart(2, "0")}`;
    for (const s of [a.linkSignature, v0, sig.compactSerialized]) {
      expect(problemsOf([record("shield", 1, 1, { ...a, linkSignature: s })])).toEqual([]);
    }
  });

  it("does not count an attestation whose account is the linked wallet in lowercase", () => {
    const a = linked(1, 501, "alice");
    const recs = [record("shield", 1, 1, a)];
    const payload = buildAttestationPayload({
      ceremonyId: ID,
      githubId: 501,
      account: a.account.toLowerCase(),
      seq: 1,
      records: chain(recs),
      client: { name: "web", version: "1.0.0", commit: "abc1234" },
    });
    const att = buildAttestationRecord(payload, "eip712", signAttestation(1, payload));
    expect(problemsOf([...recs, att])).toEqual([
      "attestation of session 1: does not cover exactly the session's contributions",
    ]);
  });
});
