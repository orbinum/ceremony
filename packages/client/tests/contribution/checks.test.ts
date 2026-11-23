import { describe, expect, it } from "vitest";
import { CheckFailed, checkHead, checkOwn } from "../../src/contribution";
import { chain, flip } from "../support";

const claimOf = (c: ReturnType<typeof chain>) => ({
  inputSha256: c.headSha256,
  outputSha256: c.outputSha256,
  contributionHash: c.contributionHash,
});

describe("checkHead", () => {
  it("accepts the announced head of the circuit and returns its chain", () => {
    const c = chain();
    expect(checkHead(c.head, c.headSha256, c.csHash).entries).toHaveLength(c.headIndex);
  });

  it("refuses bytes that do not match the announced hash", () => {
    const c = chain();
    flip(c.head, -1);
    expect(() => checkHead(c.head, c.headSha256, c.csHash)).toThrow(CheckFailed);
  });

  it("refuses another circuit's key", () => {
    const c = chain();
    expect(() => checkHead(c.head, c.headSha256, "00".repeat(64))).toThrow(/not this circuit/);
  });
});

describe("checkOwn", () => {
  it("passes an honest contribution as the next entry", () => {
    const c = chain();
    expect(() =>
      checkOwn(c.output, claimOf(c), c.head, c.params, c.csHash, c.headIndex + 1),
    ).not.toThrow();
  });

  it("refuses an output whose bytes are not the claimed ones", () => {
    const c = chain();
    flip(c.output, -100);
    expect(() =>
      checkOwn(c.output, claimOf(c), c.head, c.params, c.csHash, c.headIndex + 1),
    ).toThrow(CheckFailed);
  });

  it("refuses a claimed h_k the bytes do not carry", () => {
    const c = chain();
    const claim = { ...claimOf(c), contributionHash: "ab".repeat(64) };
    expect(() => checkOwn(c.output, claim, c.head, c.params, c.csHash, c.headIndex + 1)).toThrow(
      CheckFailed,
    );
  });

  it("refuses a contribution that is not the next index", () => {
    const c = chain();
    expect(() =>
      checkOwn(c.output, claimOf(c), c.head, c.params, c.csHash, c.headIndex + 2),
    ).toThrow(/not the next one/);
  });
});
