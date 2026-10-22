/** Strict record and document schemas: nothing malformed is ever chained. SPEC §6.3–6.4. */
import { describe, expect, it } from "vitest";
import {
  buildAttestationRecord,
  transcriptOf,
  validateRecord,
  validateTranscript,
} from "../../../src/ceremony/transcript";
import { ALICE, ANNOUNCEMENT_SHA256, chain, contribution, ID } from "../../support";

const attestation = () =>
  buildAttestationRecord(
    {
      ceremony_id: ID,
      github_id: ALICE.github_id,
      account: ALICE.account,
      seq: 1,
      contributions: [
        {
          circuit: "shield",
          index: 1,
          input_sha256: contribution(1).input_sha256,
          output_sha256: contribution(1).output_sha256,
          contribution_hash: contribution(1).contribution_hash,
        },
      ],
      client: { name: "web", version: "1.0.0", commit: "abc1234" },
    },
    "eip712",
    `0x${"22".repeat(65)}`,
  );

const doc = (patch: Record<string, unknown> = {}) => ({
  ...transcriptOf(ID, ANNOUNCEMENT_SHA256, chain([contribution(1), attestation()])),
  ...patch,
});

describe("validateTranscript", () => {
  it("accepts a transcript built by core", () => {
    expect(validateTranscript(doc()).records).toHaveLength(2);
  });

  it("refuses a null or non-object record with a FormatError, not a crash", () => {
    expect(() => validateTranscript(doc({ records: [null] }))).toThrow(
      "transcript.records[0]: expected an object",
    );
    expect(() => validateTranscript(doc({ records: [7] }))).toThrow(/records\[0\]/);
  });

  it("refuses a record of another ceremony and a circuit finalized twice", () => {
    const [first] = doc().records;
    const foreign = { ...first, ceremony_id: "other" };
    expect(() => validateTranscript(doc({ records: [foreign] }))).toThrow(
      /records\[0\]: belongs to another ceremony/,
    );
    const final = {
      circuit: "shield",
      contributions: 1,
      final_zkey_sha256: "00".repeat(32),
      vk_json_sha256: "00".repeat(32),
      vk_hash: null,
      cs_hash: "00".repeat(64),
      delta_neq_gamma: true,
      final_chain: "00".repeat(32),
    };
    expect(() => validateTranscript(doc({ finals: [final, final] }))).toThrow(
      /a circuit appears twice/,
    );
    expect(() =>
      validateTranscript(doc({ finals: [{ ...final, delta_neq_gamma: false }] })),
    ).toThrow(/delta_neq_gamma/);
  });
});

describe("validateRecord", () => {
  it("refuses an attestation whose payload is for another session or badly signed", () => {
    const a = attestation();
    expect(() => validateRecord({ ...a, seq: 2 })).toThrow(
      /signed for another ceremony or session/,
    );
    expect(() => validateRecord({ ...a, signature: "" })).toThrow(
      "record.signature: not a eip712 signature",
    );
    expect(() => validateRecord({ ...a, signature: "ab".repeat(64), scheme: "sr25519" })).toThrow(
      /record\.payload\.account/,
    );
    expect(() => validateRecord({ ...a, payload: { ...a.payload, extra: 1 } })).toThrow(
      /record\.payload: unexpected field/,
    );
  });

  it("refuses an attestation record signed for another ceremony", () => {
    const a = attestation();
    expect(() =>
      validateRecord({ ...a, payload: { ...a.payload, ceremony_id: "unit-test-2" } }),
    ).toThrow("record.payload: signed for another ceremony or session");
  });

  it("refuses a link signature without an identity, or an identity without one", () => {
    const c = contribution(1);
    expect(() => validateRecord({ ...c, link_sig: null })).toThrow(
      /link_sig: present exactly when identity is/,
    );
    expect(() => validateRecord({ ...c, identity: null })).toThrow(/link_sig/);
    expect(validateRecord({ ...c, identity: null, link_sig: null })).toMatchObject({
      identity: null,
    });
  });

  it.each([
    ["an empty name", { zkey_name: "" }, /zkey_name/],
    ["a name with a newline", { zkey_name: "a\nb" }, /zkey_name/],
    [
      "a non-hex client commit",
      { client: { name: "c", version: "1", commit: "main" } },
      /client\.commit/,
    ],
    [
      "an empty verifier version",
      {
        verified_by: {
          verifier_version: "",
          snarkjs_version: "0.7.6",
          at: "2026-10-01T00:00:00.000Z",
        },
      },
      /verifier_version/,
    ],
    ["a gist elsewhere", { gist_url: "https://evil.example/x" }, /gist_url/],
    ["index 0", { index: 0 }, /record\.index/],
    ["an unknown method", { method: "api" }, /record\.method/],
  ])("refuses a contribution with %s", (_, patch, message) => {
    expect(() => validateRecord({ ...contribution(1), ...patch })).toThrow(message);
  });

  it("refuses state and beacon records out of bounds", () => {
    const state = {
      type: "state",
      ceremony_id: ID,
      from: "OPEN",
      to: "PAUSED",
      at: "2026-10-01T00:00:00.000Z",
      reason: "x",
    };
    expect(validateRecord(state)).toEqual(state);
    expect(() => validateRecord({ ...state, to: "DONE" })).toThrow(/record\.to/);
    expect(() => validateRecord({ ...state, reason: "" })).toThrow(/record\.reason/);
    const beacon = {
      type: "beacon",
      ceremony_id: ID,
      source: "drand",
      chain_hash: "00".repeat(32),
      round: 1,
      randomness: "00".repeat(32),
      signature: "00".repeat(48),
      iterations_exp: 10,
      relays: ["r"],
      sealed_at: "2026-10-01T00:00:00.000Z",
    };
    expect(() => validateRecord({ ...beacon, relays: [] })).toThrow(/record\.relays: fewer than 1/);
    expect(() => validateRecord({ ...beacon, round: 0 })).toThrow(/record\.round/);
    expect(() => validateRecord({ ...beacon, relays: Array(9).fill("r") })).toThrow(/more than 8/);
  });

  it("refuses an unknown type and a non-object", () => {
    expect(() => validateRecord({ type: "other" })).toThrow(/record\.type/);
    expect(() => validateRecord(null)).toThrow("record: expected an object");
  });
});
