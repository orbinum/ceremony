/**
 * `ceremony.json`: built with its derived round, validated strictly, read only canonical. SPEC
 * §5.2, §6.2.
 */
import { describe, expect, it } from "vitest";
import {
  type AnnouncementInput,
  buildAnnouncement,
  type CeremonyAnnouncement,
  parseAnnouncement,
  validateAnnouncement,
} from "../../../src/ceremony/announcement";
import { roundAt, roundTime } from "../../../src/ceremony/beacon";
import { MAX_CONTRIBUTIONS } from "../../../src/config";
import { serializeJson } from "../../../src/primitives/encoding";

const input: AnnouncementInput = {
  ceremonyId: "orbinum-testnet-rehearsal-1",
  network: "testnet",
  initSha256: "ab".repeat(32),
  circuitsSource: {
    repo: "https://github.com/orbinum/circuits",
    tag: "v0.16.0",
    commit: "e".repeat(40),
  },
  minContributions: 20,
  open: new Date("2026-11-20T00:00:00.000Z"),
  close: new Date("2026-11-30T00:00:00.000Z"),
  beaconDelaySeconds: 86_400,
};

const announcement = buildAnnouncement(input);
const tamper = (patch: (a: CeremonyAnnouncement) => void) => {
  const copy = structuredClone(announcement);
  patch(copy);
  return copy;
};

describe("buildAnnouncement", () => {
  it("derives the beacon round from the schedule (first round 24 h after closing)", () => {
    expect(announcement.schedule.beacon).toBe("2026-12-01T00:00:00.000Z");
    expect(announcement.beacon.round).toBe(roundAt(Date.parse("2026-12-01T00:00:00.000Z") / 1000));
    expect(roundTime(announcement.beacon.round) * 1000).toBeGreaterThanOrEqual(
      Date.parse(announcement.schedule.beacon),
    );
  });

  it("round-trips through validation", () => {
    expect(validateAnnouncement(structuredClone(announcement))).toEqual(announcement);
  });
});

/** Moves the beacon time, with the round it implies (so only the rule under test can fail). */
const beaconAt = (a: CeremonyAnnouncement, iso: string) => {
  a.schedule.beacon = iso;
  a.beacon.round = roundAt(Date.parse(iso) / 1000);
};
const afterClose = (seconds: number) =>
  new Date(Date.parse(announcement.schedule.close) + seconds * 1000).toISOString();

describe("validateAnnouncement rejects", () => {
  it.each([
    [
      "a hand-picked beacon round",
      tamper((a) => {
        a.beacon.round += 1;
      }),
      /is not the first round at/,
    ],
    [
      "a round before the announced time",
      tamper((a) => {
        a.beacon.round -= 100;
      }),
      /is not the first round at/,
    ],
    [
      "a beacon scheduled before closing",
      tamper((a) => beaconAt(a, "2026-11-29T00:00:00.000Z")),
      /open < close ≤ beacon/,
    ],
    [
      "closing before opening",
      tamper((a) => {
        a.schedule.close = "2026-11-19T00:00:00.000Z";
      }),
      /open < close ≤ beacon/,
    ],
    [
      "another drand chain",
      tamper((a) => {
        a.beacon.chain_hash = "00".repeat(32);
      }),
      /not the pinned drand chain/,
    ],
    [
      "other beacon iterations",
      tamper((a) => {
        a.beacon.iterations_exp = 11;
      }),
      /unexpected beacon iterations/,
    ],
    [
      "a mainnet ceremony with fewer than 50 contributions",
      tamper((a) => {
        a.network = "mainnet";
        a.min_contributions = 49;
      }),
      /mainnet requires at least 50 contributions/,
    ],
    [
      "zero minimum contributions",
      tamper((a) => {
        a.min_contributions = 0;
      }),
      /min_contributions: expected an integer in \[1, 9999\]/,
    ],
    [
      "a minimum no zkey can hold",
      tamper((a) => {
        a.min_contributions = MAX_CONTRIBUTIONS + 1;
      }),
      /min_contributions: expected an integer in \[1, 9999\]/,
    ],
    [
      "a tag that is not a full commit",
      tamper((a) => {
        a.circuits_source.commit = "v0.16.0";
      }),
      /circuits_source\.commit/,
    ],
    [
      "an unknown network",
      tamper((a) => {
        (a as { network: string }).network = "devnet";
      }),
      /announcement\.network: expected one of/,
    ],
    ["an extra field", { ...announcement, trusted_by: "orbinum" }, /unexpected field "trusted_by"/],
    [
      "a testnet beacon before the last acceptance can land",
      tamper((a) => beaconAt(a, afterClose(299))),
      /the beacon must come at least 300 s after close on testnet/,
    ],
    [
      "a mainnet beacon less than a day after the close",
      tamper((a) => {
        a.network = "mainnet";
        a.min_contributions = 50;
        beaconAt(a, afterClose(86_399));
      }),
      /the beacon must come at least 86400 s after close on mainnet/,
    ],
    [
      "a circuits repository other than the audited one, outside local",
      tamper((a) => {
        a.circuits_source.repo = "https://github.com/mallory/circuits";
      }),
      /circuits_source\.repo must be https:\/\/github\.com\/orbinum\/circuits on testnet/,
    ],
  ])("%s", (_, value, message) => {
    expect(() => validateAnnouncement(value)).toThrow(message);
  });
});

describe("validateAnnouncement accepts", () => {
  it("the shortest beacon delay of each network", () => {
    expect(() => validateAnnouncement(tamper((a) => beaconAt(a, afterClose(300))))).not.toThrow();
    const local = tamper((a) => {
      a.network = "local";
      a.circuits_source.repo = "/tmp/circuits";
      beaconAt(a, a.schedule.close);
    });
    expect(validateAnnouncement(local).circuits_source.repo).toBe("/tmp/circuits");
    const mainnet = tamper((a) => {
      a.network = "mainnet";
      a.min_contributions = MAX_CONTRIBUTIONS;
      beaconAt(a, afterClose(86_400));
    });
    expect(() => validateAnnouncement(mainnet)).not.toThrow();
  });
});

describe("parseAnnouncement (the pinned bytes)", () => {
  const text = serializeJson(announcement);

  it("reads the canonical text", () => {
    expect(parseAnnouncement(text)).toEqual(announcement);
  });

  it.each([
    [
      "a duplicated key that a reader sees first and a tool reads last",
      text.replace('"network": "testnet",', '"network": "mainnet",\n  "network": "testnet",'),
    ],
    [
      "keys in another order",
      `${JSON.stringify(Object.fromEntries(Object.entries(announcement).toReversed()), null, 2)}\n`,
    ],
    ["no final newline", text.slice(0, -1)],
    ["CRLF line ends", text.replaceAll("\n", "\r\n")],
    ["minified JSON", `${JSON.stringify(announcement)}\n`],
    [
      "a number in another spelling",
      text.replace('"min_contributions": 20', '"min_contributions": 2e1'),
    ],
  ])("refuses %s", (_, bytes) => {
    expect(() => parseAnnouncement(bytes)).toThrow(/ceremony\.json: not in canonical form/);
  });

  it("refuses text that is not JSON, or not text", () => {
    expect(() => parseAnnouncement("{")).toThrow("ceremony.json: not valid JSON");
    expect(() => parseAnnouncement(announcement as unknown as string)).toThrow(/expected text/);
  });
});
