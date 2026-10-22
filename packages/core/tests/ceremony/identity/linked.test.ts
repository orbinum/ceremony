/** Linked identities and the requests that bind or sign with them. SPEC §3.4–3.5. */
import { describe, expect, it } from "vitest";
import {
  checkRelink,
  contributorOf,
  type LinkedIdentity,
  linkPayloadOf,
  validateAttestationRequest,
  validateLinkRequest,
} from "../../../src/ceremony/identity";
import { FormatError } from "../../../src/primitives/errors";

const LINKED: LinkedIdentity = {
  githubId: 5,
  login: "octo",
  scheme: "eip712",
  account: "0x" + "ab".repeat(20),
  accountKey: "0x" + "ab".repeat(20),
  signature: "11".repeat(65),
  nonce: "cd".repeat(32),
  issuedAt: 1_700_000_000,
  linkedAt: 1,
};
const PAYLOAD = {
  ceremony_id: "c",
  github_id: 5,
  github_login: "octo",
  account: "0x" + "ab".repeat(20),
  nonce: "cd".repeat(32),
  issued_at: 1_700_000_000,
};

describe("linked identities", () => {
  it("names the contributor a record carries", () => {
    expect(contributorOf(LINKED)).toEqual({
      github_id: 5,
      github_login: "octo",
      account: LINKED.account,
      scheme: "eip712",
      nonce: LINKED.nonce,
      issued_at: LINKED.issuedAt,
      linkSignature: LINKED.signature,
    });
  });

  it("rebuilds from a recorded identity exactly the link payload it signed", () => {
    const { linkSignature: _, ...identity } = contributorOf(LINKED);
    expect(linkPayloadOf("c", identity)).toEqual(PAYLOAD);
  });

  it("allows relinking the same key only", () => {
    expect(checkRelink(LINKED, LINKED.accountKey)).toBeNull();
    expect(checkRelink(LINKED, "0x" + "cd".repeat(20))).toBe("already-linked");
  });

  it("reads a link request exactly: scheme, payload, signature", () => {
    const body = { scheme: "eip712", payload: PAYLOAD, signature: `0x${"12".repeat(65)}` };
    expect(validateLinkRequest(body)).toMatchObject({ scheme: "eip712", payload: PAYLOAD });
    for (const bad of [
      null,
      { ...body, extra: 1 },
      { ...body, scheme: "rsa" },
      { ...body, signature: "0x12" },
      { ...body, payload: { ...PAYLOAD, nonce: "x" } },
    ]) {
      expect(() => validateLinkRequest(bad)).toThrow(FormatError);
    }
    expect(() => validateLinkRequest({ ...body, payload: { ...PAYLOAD, nonce: "x" } })).toThrow(
      /link\.payload\.nonce/,
    );
  });

  it("reads an attestation request under the linked scheme", () => {
    expect(() => validateAttestationRequest({ payload: {}, signature: "0x" }, "eip712")).toThrow(
      FormatError,
    );
    expect(() =>
      validateAttestationRequest({ payload: {}, signature: "0x", x: 1 }, "eip712"),
    ).toThrow(/unexpected field/);
  });
});
