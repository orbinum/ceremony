/**
 * Announcement field rules, the beacon delay when building, and the contribution window. SPEC §4.3,
 * §6.2.
 */
import { describe, expect, it } from "vitest";
import {
  asTag,
  acceptanceWindow,
  buildAnnouncement,
  checkVerifyMode,
  skippedCheckStatus,
  validateAnnouncement,
  windowState,
} from "../../../src/ceremony/announcement";
import { VERIFY_DEADLINE_MS } from "../../../src/config";
import { serializeJson } from "../../../src/primitives/encoding";
import { ANNOUNCEMENT, CLOSE, OPEN } from "../../support";

const patch = (p: Record<string, unknown>) => ({ ...ANNOUNCEMENT, ...p });

describe("announcement rules", () => {
  it.each([
    [
      "a missing field",
      (() => {
        const { network: _, ...rest } = ANNOUNCEMENT;
        return rest;
      })(),
      /missing field "network"/,
    ],
    [
      "an unexpected nested field",
      patch({ schedule: { ...ANNOUNCEMENT.schedule, extra: 1 } }),
      /announcement\.schedule: unexpected field/,
    ],
    [
      "uppercase hex",
      patch({ init_sha256: ANNOUNCEMENT.init_sha256.toUpperCase() }),
      /init_sha256/,
    ],
    [
      "open = close",
      patch({ schedule: { ...ANNOUNCEMENT.schedule, close: ANNOUNCEMENT.schedule.open } }),
      /open < close/,
    ],
    [
      "another beacon network",
      patch({ beacon: { ...ANNOUNCEMENT.beacon, network: "mainnet" } }),
      /beacon\.network/,
    ],
    ["round 0", patch({ beacon: { ...ANNOUNCEMENT.beacon, round: 0 } }), /beacon\.round/],
    [
      "a repo that reads as an option",
      patch({ circuits_source: { ...ANNOUNCEMENT.circuits_source, repo: "--x" } }),
      /circuits_source\.repo/,
    ],
    [
      "a tag that reads as an option",
      patch({ circuits_source: { ...ANNOUNCEMENT.circuits_source, tag: "-v1" } }),
      /circuits_source\.tag/,
    ],
  ])("refuses %s", (_, doc, message) => {
    expect(() => validateAnnouncement(doc)).toThrow(message);
  });

  it("refuses an invalid beacon delay or date when building", () => {
    const input = {
      ceremonyId: "x-1",
      network: "local" as const,
      initSha256: "00".repeat(32),
      circuitsSource: ANNOUNCEMENT.circuits_source,
      minContributions: 1,
      open: new Date(OPEN),
      close: new Date(CLOSE),
      beaconDelaySeconds: 60,
    };
    expect(buildAnnouncement(input).ceremony_id).toBe("x-1");
    expect(() => buildAnnouncement({ ...input, beaconDelaySeconds: -1 })).toThrow(
      /beaconDelaySeconds/,
    );
    expect(() => buildAnnouncement({ ...input, beaconDelaySeconds: 0.5 })).toThrow(
      /beaconDelaySeconds/,
    );
    expect(() => buildAnnouncement({ ...input, open: new Date(Number.NaN) })).toThrow(
      "open: invalid date",
    );
  });

  it("serializes to the pinned bytes: two-space JSON plus a newline", () => {
    expect(serializeJson(ANNOUNCEMENT)).toBe(`${JSON.stringify(ANNOUNCEMENT, null, 2)}\n`);
  });

  it("knows when contributions may be made and accepted", () => {
    expect(windowState(ANNOUNCEMENT, OPEN - 1)).toBe("before");
    expect(windowState(ANNOUNCEMENT, OPEN)).toBe("open");
    expect(windowState(ANNOUNCEMENT, CLOSE)).toBe("closed");
    expect(acceptanceWindow(ANNOUNCEMENT)).toEqual({ from: OPEN, to: CLOSE + VERIFY_DEADLINE_MS });
  });
});

describe("release tags", () => {
  it("takes what git takes as a tag name, and refuses what would name something else", () => {
    for (const tag of ["v0.16.0", "release/1.2", "v1.0.0-rc.1"]) expect(asTag(tag, "t")).toBe(tag);
    for (const tag of [
      "HEAD",
      "refs/tags/v1",
      "abcdef1",
      "../heads/main",
      "v1..2",
      "v1@{0}",
      "/v1",
      "v1/",
      "a//b",
      ".hidden",
      "dir/.hidden",
      "v1.lock",
      "v1.lock/x",
      "v1.",
    ]) {
      expect(() => asTag(tag, tag)).toThrow(/not a tag name|does not match/);
    }
  });
});

describe("verification mode", () => {
  it("is local exactly for a local ceremony", () => {
    const local = patch({ network: "local" }) as typeof ANNOUNCEMENT;
    expect(checkVerifyMode(local, true)).toEqual([]);
    expect(checkVerifyMode(ANNOUNCEMENT, false)).toEqual([]);
    expect(checkVerifyMode(local, false)).toEqual(["a local ceremony needs --local"]);
    expect(checkVerifyMode(ANNOUNCEMENT, true)).toEqual([
      "--local cannot verify a testnet ceremony",
    ]);
  });

  it("counts a skipped security check as a failure outside local mode", () => {
    expect(skippedCheckStatus(true, false)).toBe("fail");
    expect(skippedCheckStatus(true, true)).toBe("skip");
    expect(skippedCheckStatus(false, false)).toBe("skip");
  });
});
