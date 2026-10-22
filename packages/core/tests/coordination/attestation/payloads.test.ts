/** The payloads wallets sign, built and checked against the session. SPEC §3.4–3.5. */
import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady, signatureVerify } from "@polkadot/util-crypto";
import { Wallet, verifyTypedData } from "ethers";
import { describe, expect, it } from "vitest";
import {
  attestationTypedData,
  ethersTypedData,
  linkTypedData,
  sr25519Message,
} from "../../../src/ceremony/identity";
import {
  attestedContributionsOf,
  buildAttestationRecord,
  validateRecord,
} from "../../../src/ceremony/transcript";
import {
  buildAttestationPayload,
  buildLinkPayload,
  checkAttestation,
  checkLink,
} from "../../../src/coordination/attestation";
import { LINK_RULES } from "../../../src/config";
import { ALICE, chain, contribution, ID } from "../../support";

const CLIENT = { name: "web", version: "1.0.0", commit: "abc1234" };
const NOW = Date.parse("2026-10-01T12:00:00.000Z");
const session = { ceremonyId: ID, githubId: ALICE.github_id, githubLogin: ALICE.github_login };

describe("link payloads (SPEC §3.4)", () => {
  const link = buildLinkPayload({
    ...session,
    account: ALICE.account,
    nonce: "ab".repeat(32),
    now: NOW,
  });

  it("belong to the session that issued them, within the skew", () => {
    expect(checkLink(link, session, NOW)).toBeNull();
    expect(checkLink(link, session, NOW + LINK_RULES.maxSkewS * 1000)).toBeNull();
    expect(checkLink(link, session, NOW + LINK_RULES.maxSkewS * 1000 + 1000)).toBe(
      "stale-signature",
    );
    expect(checkLink(link, { ...session, githubLogin: "mallory" }, NOW)).toBe("wrong-identity");
    expect(checkLink(link, { ...session, githubId: session.githubId + 1 }, NOW)).toBe(
      "wrong-identity",
    );
    expect(checkLink(link, { ...session, ceremonyId: "other" }, NOW)).toBe("wrong-identity");
  });

  it("verify under EIP-712 with the ethers argument form", async () => {
    const wallet = Wallet.createRandom();
    const p = { ...link, account: wallet.address };
    const sig = await wallet.signTypedData(...ethersTypedData(linkTypedData(p)));
    expect(verifyTypedData(...ethersTypedData(linkTypedData(p)), sig)).toBe(wallet.address);
  });
});

describe("attestations (SPEC §3.5)", () => {
  const records = chain([contribution(1, 1), contribution(2, 2)]);
  const linked = { ceremonyId: ID, githubId: ALICE.github_id, account: ALICE.account };
  const payload = buildAttestationPayload({ ...linked, seq: 1, records, client: CLIENT });

  it("cover exactly the session's accepted records", () => {
    expect(attestedContributionsOf(records, 1, ALICE.github_id)).toHaveLength(1);
    expect(attestedContributionsOf(records, 1, 999)).toEqual([]);
    expect(checkAttestation(payload, linked, records)).toBeNull();
  });

  it.each([
    ["another account", () => ({ ...payload, account: `0x${"b".repeat(40)}` })],
    ["another identity", () => ({ ...payload, github_id: 999 })],
    ["another session's records", () => ({ ...payload, seq: 2 })],
    ["a session with nothing accepted", () => ({ ...payload, seq: 3 })],
    [
      "an empty attestation of a session with nothing accepted",
      () => ({ ...payload, seq: 3, contributions: [] }),
    ],
    [
      "a changed hash",
      () => ({
        ...payload,
        contributions: [{ ...payload.contributions[0], contribution_hash: "ff".repeat(64) }],
      }),
    ],
  ])("refuse %s", (_name, edit) => {
    expect(checkAttestation(edit() as typeof payload, linked, records)).toBe(
      "attestation-mismatch",
    );
  });

  it("are recorded once per session", () => {
    const signed = chain([
      contribution(1, 1),
      contribution(2, 2),
      buildAttestationRecord(payload, "eip712", `0x${"11".repeat(65)}`),
    ]);
    expect(checkAttestation(payload, linked, signed)).toBe("already-attested");
  });

  it("sign the same bytes the transcript validates, for both schemes", async () => {
    const wallet = Wallet.createRandom();
    const evm = { ...payload, account: wallet.address };
    const sig = await wallet.signTypedData(...ethersTypedData(attestationTypedData(evm)));
    expect(verifyTypedData(...ethersTypedData(attestationTypedData(evm)), sig)).toBe(
      wallet.address,
    );
    expect(validateRecord(buildAttestationRecord(evm, "eip712", sig))).toMatchObject({ seq: 1 });

    await cryptoWaitReady();
    const pair = new Keyring({ type: "sr25519" }).addFromUri("//Alice");
    const sub = { ...payload, account: pair.address };
    const text = sr25519Message("attestation", sub);
    const subSig = pair.sign(text);
    expect(signatureVerify(text, subSig, pair.address).isValid).toBe(true);
    expect(text.split("\n").slice(0, 2)).toEqual(["Orbinum Trusted Setup v1", "attestation"]);
    expect(
      validateRecord(
        buildAttestationRecord(sub, "sr25519", `0x${Buffer.from(subSig).toString("hex")}`),
      ),
    ).toMatchObject({ scheme: "sr25519" });
  });
});
