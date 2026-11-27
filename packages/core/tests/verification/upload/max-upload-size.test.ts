/**
 * The bounds an upload is held to before any byte is read: the genesis size plus 1 KiB per
 * contribution, never above the file cap, and a claim computed on another head is stale.
 */
import { describe, expect, it } from "vitest";
import { MAX_FILE_BYTES } from "../../../src/config";
import { isStaleHead, maxUploadSize } from "../../../src/verification/upload";

describe("upload bounds", () => {
  it("allows the genesis size plus 1 KiB per contribution, never more than the file cap", () => {
    expect(maxUploadSize(10_000, 1)).toBe(11_024);
    expect(maxUploadSize(10_000, 3)).toBe(13_072);
    expect(maxUploadSize(MAX_FILE_BYTES, 1)).toBe(MAX_FILE_BYTES);
  });

  it("calls a claim stale when it was computed on another head", () => {
    expect(isStaleHead({ inputSha256: "a" }, { outputSha256: "a" })).toBe(false);
    expect(isStaleHead({ inputSha256: "a" }, { outputSha256: "b" })).toBe(true);
  });
});
