/**
 * The pre-checks on an upload's bytes, before any pairing: contribution 2 on the head after
 * contribution 1 passes, and each malformed claim, tampered, stale, padded, re-laid-out, skipping,
 * lying or beacon upload is refused with its reason, as is any upload on a head already holding
 * `MAX_CONTRIBUTIONS` contributions.
 */
import { describe, expect, it } from "vitest";
import { MAX_CONTRIBUTIONS } from "../../../src/config";
import { sha256Hex } from "../../../src/primitives/hashing";
import { readMpcParams } from "../../../src/formats/mpc";
import {
  type CurrentHead,
  genesisLayoutOf,
  precheckUpload,
  type UploadClaim,
} from "../../../src/verification";
import { joinBinfile, loadZkey, splitBinfile } from "../../support";

const genesis = loadZkey("0");
const LAYOUT = genesisLayoutOf(genesis);
const one = loadZkey("1");
const two = loadZkey("2");
const final = loadZkey("final");
const entries = readMpcParams(final).entries;
const csHash = readMpcParams(genesis).csHash;
const recorded = (n: number) =>
  entries.slice(0, n).map((e) => ({ hash: e.hash, name: e.name ?? "", deltaAfter: e.deltaAfter }));

const head: CurrentHead = { outputSha256: sha256Hex(one), csHash, previous: recorded(1) };
const filled = (n: number): CurrentHead => ({
  ...head,
  previous: Array.from({ length: n }, () => recorded(1)[0] as CurrentHead["previous"][0]),
});
const claim: UploadClaim = {
  inputSha256: sha256Hex(one),
  outputSha256: sha256Hex(two),
  contributionHash: entries[1]?.hash as string,
};

describe("precheckUpload", () => {
  it("accepts a contribution that extends the head", () => {
    expect(precheckUpload(two, claim, head, LAYOUT)).toEqual({
      ok: true,
      index: 2,
      contributionHash: entries[1]?.hash,
      deltaAfter: entries[1]?.deltaAfter,
      name: "bob",
    });
  });

  it("accepts a claim written in uppercase hex (normalized, not rejected)", () => {
    const upper = {
      inputSha256: claim.inputSha256.toUpperCase(),
      outputSha256: claim.outputSha256.toUpperCase(),
      contributionHash: claim.contributionHash.toUpperCase(),
    };
    expect(precheckUpload(two, upper, head, LAYOUT)).toMatchObject({ ok: true, index: 2 });
  });

  it.each([
    ["a non-hex hash", { ...claim, outputSha256: "zz".repeat(32) }],
    ["a short hash", { ...claim, contributionHash: "ab" }],
    ["a non-string", { ...claim, inputSha256: 42 as unknown as string }],
  ])("rejects a claim with %s", (_, bad) => {
    expect(precheckUpload(two, bad, head, LAYOUT)).toMatchObject({ reason: "malformed-claim" });
  });

  it("rejects bytes that differ from the declared hash", () => {
    const tampered = two.slice();
    tampered.set([(tampered.at(-1) ?? 0) ^ 1], tampered.length - 1);
    expect(precheckUpload(tampered, claim, head, LAYOUT)).toMatchObject({
      reason: "output-hash-mismatch",
    });
  });

  it("rejects an upload built on a stale head", () => {
    const stale = { ...claim, inputSha256: sha256Hex(genesis) };
    expect(precheckUpload(two, stale, head, LAYOUT)).toMatchObject({ reason: "stale-head" });
  });

  it("rejects any upload on a head already holding MAX_CONTRIBUTIONS contributions", () => {
    expect(precheckUpload(two, claim, filled(MAX_CONTRIBUTIONS), LAYOUT)).toEqual({
      ok: false,
      result: "rejected",
      reason: "malformed",
      detail: `the circuit already holds ${MAX_CONTRIBUTIONS} contributions`,
    });
    expect(precheckUpload(two, claim, filled(MAX_CONTRIBUTIONS - 1), LAYOUT)).not.toMatchObject({
      detail: expect.stringMatching(/already holds/),
    });
  });

  it("rejects bytes that are not a zkey", () => {
    const junk = new TextEncoder().encode("not a zkey");
    const res = precheckUpload(junk, { ...claim, outputSha256: sha256Hex(junk) }, head, LAYOUT);
    expect(res).toMatchObject({ ok: false, result: "rejected", reason: "malformed" });
  });

  it("rejects a padded zkey even though snarkjs would accept it", () => {
    const padded = new Uint8Array([...two, 0, 0]);
    const res = precheckUpload(padded, { ...claim, outputSha256: sha256Hex(padded) }, head, LAYOUT);
    expect(res).toMatchObject({ reason: "malformed" });
  });

  it("rejects a chain that skips the recorded head", () => {
    const res = precheckUpload(one, { ...claim, outputSha256: sha256Hex(one) }, head, LAYOUT);
    expect(res).toMatchObject({ reason: "wrong-count" });
  });

  it("rejects a client that lies about h_k", () => {
    const res = precheckUpload(two, { ...claim, contributionHash: "00".repeat(64) }, head, LAYOUT);
    expect(res).toMatchObject({ reason: "client-hash-mismatch" });
  });

  it("rejects the beacon as a contribution", () => {
    const afterTwo: CurrentHead = { outputSha256: sha256Hex(two), csHash, previous: recorded(2) };
    const res = precheckUpload(
      final,
      {
        inputSha256: sha256Hex(two),
        outputSha256: sha256Hex(final),
        contributionHash: entries[2]?.hash as string,
      },
      afterTwo,
      LAYOUT,
    );
    expect(res).toMatchObject({ reason: "not-a-contribution" });
  });

  it("bounds parsing by the head: more entries than the head allows are refused unread", () => {
    const res = precheckUpload(final, { ...claim, outputSha256: sha256Hex(final) }, head, LAYOUT);
    expect(res).toMatchObject({
      ok: false,
      reason: "malformed",
      detail: "declares 3 entries, at most 2 allowed",
    });
  });

  it("says which claim field is malformed", () => {
    const res = precheckUpload(two, { ...claim, inputSha256: "xyz" }, head, LAYOUT);
    expect(res).toMatchObject({
      ok: false,
      reason: "malformed-claim",
      detail: "inputSha256: expected 32-byte lowercase hex",
    });
  });

  it("refuses the right contribution laid out differently (another file hash, same key)", () => {
    const f = splitBinfile(two);
    const [a, b, ...rest] = f.sections;
    const swapped = joinBinfile(f.magic, f.version, [b, a, ...rest] as typeof f.sections);
    const res = precheckUpload(
      swapped,
      { ...claim, outputSha256: sha256Hex(swapped) },
      head,
      LAYOUT,
    );
    expect(res).toMatchObject({ ok: false, reason: "malformed" });
  });
});
