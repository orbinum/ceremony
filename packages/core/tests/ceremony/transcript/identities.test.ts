/**
 * Who contributed is verifiable from the transcript alone: link and attestation signatures over
 * what they signed, one GitHub account and one wallet per circuit, an identity on every
 * non-simulated contribution outside local ceremonies. SPEC §3.4–3.5, §6.3.
 */
import { TypedDataEncoder } from "ethers";
import { describe, expect, it } from "vitest";
import {
  ethersTypedData,
  type Identity,
  linkPayloadOf,
  linkTypedData,
  LOCAL_BUILD,
  LOCAL_VERIFIER,
} from "../../../src/ceremony/identity";
import {
  buildAttestationRecord,
  checkIdentities,
  checkTranscript,
  type ContributionRecord,
  transcriptOf,
} from "../../../src/ceremony/transcript";
import { buildAttestationPayload } from "../../../src/coordination/attestation";
import {
  ANNOUNCEMENT,
  ANNOUNCEMENT_SHA256,
  chain,
  contribution,
  contributor,
  ID,
  INIT,
  OPEN,
  signAttestation,
  walletOf,
} from "../../support";

const CLIENT = { name: "web", version: "1.0.0", commit: "abc1234" };
const LOCAL = { ...ANNOUNCEMENT, network: "local" as const };
const MAINNET = { ...ANNOUNCEMENT, network: "mainnet" as const };

/** Contribution k by contributor k, then contributor 1's attestation of session 1. */
function attested(sign = signAttestation) {
  const records = chain([contribution(1), contribution(2)]);
  const alice = contributor(1);
  const payload = buildAttestationPayload({
    ceremonyId: ID,
    githubId: alice.github_id,
    account: alice.account,
    seq: 1,
    records,
    client: CLIENT,
  });
  return {
    payload,
    records: [
      contribution(1),
      contribution(2),
      buildAttestationRecord(payload, "eip712", sign(1, payload)),
    ],
  };
}

const problemsOf = (records: Parameters<typeof chain>[0], a = ANNOUNCEMENT) =>
  checkIdentities(chain(records), a).problems;

/** Contributor n relinked under GitHub id `githubId`, signing with the same wallet. */
function sameWalletAs(n: number, githubId: number): Identity & { linkSignature: string } {
  const identity: Identity = { ...contributor(n), github_id: githubId, github_login: "mallory" };
  const typed = ethersTypedData(linkTypedData(linkPayloadOf(ID, identity)));
  const linkSignature = walletOf(n).signingKey.sign(TypedDataEncoder.hash(...typed)).serialized;
  return { ...identity, linkSignature };
}

describe("signatures in the transcript", () => {
  it("verify for an honest ceremony, and count the attested contributions", () => {
    const r = checkIdentities(chain(attested().records), ANNOUNCEMENT);
    expect(r).toEqual({ problems: [], attested: 1, contributions: 2 });
  });

  it("are a check of the finished transcript, with the attested count", () => {
    const t = transcriptOf(ID, ANNOUNCEMENT_SHA256, chain(attested().records));
    const check = checkTranscript(t, ANNOUNCEMENT, ANNOUNCEMENT_SHA256, INIT).checks.find((c) =>
      c.id.startsWith("signatures verify"),
    );
    expect(check).toEqual({
      id: "signatures verify; one GitHub account and one wallet per circuit",
      problems: [],
      detail: "1 of 2 contributions attested",
    });
  });

  it("flag a forged link signature on a record", () => {
    const forged = { ...contribution(2), link_sig: contributor(3).linkSignature.slice(2) };
    const t = transcriptOf(ID, ANNOUNCEMENT_SHA256, chain([contribution(1), forged]));
    const failing = checkTranscript(t, ANNOUNCEMENT, ANNOUNCEMENT_SHA256, INIT).checks.find((c) =>
      c.id.startsWith("signatures verify"),
    );
    expect(failing?.problems).toEqual(["shield #2: link signature does not verify"]);
  });

  it("flag a record whose link fields differ from what was signed", () => {
    const c = contribution(1);
    const moved = { ...c, identity: { ...(c.identity as Identity), nonce: "cd".repeat(32) } };
    expect(problemsOf([moved])).toEqual(["shield #1: link signature does not verify"]);
    const renamed = { ...c, identity: { ...(c.identity as Identity), github_login: "mallory" } };
    expect(problemsOf([renamed])).toEqual(["shield #1: link signature does not verify"]);
  });

  it("flag a forged attestation signature", () => {
    const { records } = attested((_, p) => signAttestation(2, p));
    expect(problemsOf(records)).toEqual(["attestation of session 1: signature does not verify"]);
  });

  it("flag an attestation that does not cover exactly its session's contributions", () => {
    const { payload, records } = attested();
    const moved = { ...payload, seq: 2 };
    const other = buildAttestationRecord(moved, "eip712", signAttestation(1, moved));
    expect(problemsOf([...records.slice(0, 2), other])).toEqual([
      "attestation of session 2: does not cover exactly the session's contributions",
    ]);
    const changed = {
      ...payload,
      contributions: [{ ...payload.contributions[0]!, output_sha256: "ff".repeat(32) }],
    };
    const lie = buildAttestationRecord(changed, "eip712", signAttestation(1, changed));
    expect(problemsOf([...records.slice(0, 2), lie])).toEqual([
      "attestation of session 1: does not cover exactly the session's contributions",
    ]);
  });

  it("flag an attestation recorded before the contributions it covers", () => {
    const { records } = attested();
    expect(problemsOf([records[2]!, records[0]!, records[1]!])).toEqual([
      "attestation of session 1: does not cover exactly the session's contributions",
    ]);
  });

  it("flag an attestation by another wallet than the session's", () => {
    const { payload, records } = attested();
    const byOther = { ...payload, account: contributor(2).account };
    const record = buildAttestationRecord(byOther, "eip712", signAttestation(2, byOther));
    expect(problemsOf([...records.slice(0, 2), record])).toEqual([
      "attestation of session 1: does not cover exactly the session's contributions",
    ]);
  });

  it("flag a session attested twice", () => {
    const { records } = attested();
    expect(problemsOf([...records, records[2]!])).toEqual([
      "attestation of session 1: session attested twice",
    ]);
  });
});

describe("one identity per circuit", () => {
  it("flags one GitHub account contributing twice to a circuit", () => {
    const twice = contribution(2, 2, OPEN + 120_000, contributor(1));
    expect(problemsOf([contribution(1), twice])).toEqual([
      "shield #2: GitHub id 101 again",
      "shield #2: the same wallet again",
    ]);
    const relinked = { ...contributor(1), account: contributor(3).account };
    expect(problemsOf([contribution(1), contribution(2, 2, OPEN + 120_000, relinked)])).toContain(
      "shield #2: GitHub id 101 again",
    );
  });

  it("flags one wallet contributing twice under two GitHub accounts", () => {
    const twice = contribution(2, 2, OPEN + 120_000, sameWalletAs(1, 202));
    expect(problemsOf([contribution(1), twice])).toEqual(["shield #2: the same wallet again"]);
  });
});

const anonymous = (k: number, simulated: boolean): ContributionRecord => {
  const r = contribution(k);
  return {
    ...r,
    identity: null,
    link_sig: null,
    ...(simulated
      ? {
          client: { ...r.client, commit: LOCAL_BUILD },
          verified_by: { ...r.verified_by, verifier_version: LOCAL_VERIFIER },
        }
      : {}),
  };
};

describe("contributions without an identity", () => {
  it("are allowed for simulated contributions and in local ceremonies", () => {
    expect(problemsOf([anonymous(1, true)])).toEqual([]);
    expect(problemsOf([anonymous(1, false)], LOCAL)).toEqual([]);
  });

  it("are refused outside a local ceremony for an online contribution", () => {
    expect(problemsOf([anonymous(1, false)])).toEqual([
      "shield #1: no identity outside a simulated contribution",
    ]);
    expect(problemsOf([anonymous(1, false)], MAINNET)).toEqual([
      "shield #1: no identity outside a simulated contribution",
    ]);
  });
});
