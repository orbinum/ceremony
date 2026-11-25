/**
 * Invitations in `ceremony.json`: one canonical list, a closed ceremony only as a rehearsal that
 * can still reach its minimum, and announcements without invitations keep their bytes. SPEC §3.2.
 */
import { describe, expect, it } from "vitest";
import {
  type AnnouncementInput,
  buildAnnouncement,
  type CeremonyAnnouncement,
  isClosed,
  isInvited,
  validateAnnouncement,
} from "../../../src/ceremony/announcement";
import { MAX_INVITED } from "../../../src/config";
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
  minContributions: 2,
  open: new Date("2026-11-20T00:00:00.000Z"),
  close: new Date("2026-11-30T00:00:00.000Z"),
  beaconDelaySeconds: 86_400,
};

const closed = buildAnnouncement({
  ...input,
  admission: { mode: "closed", invited: [30, 10, 20] },
});
const tamper = (patch: (a: CeremonyAnnouncement) => void) => {
  const copy = structuredClone(closed);
  patch(copy);
  return copy;
};

describe("announced invitations", () => {
  it("builds one canonical list: ascending, without repeats", () => {
    const a = buildAnnouncement({ ...input, admission: { mode: "open", invited: [7, 3, 7, 5] } });
    expect(a.admission).toEqual({ mode: "open", invited: [3, 5, 7] });
    expect(validateAnnouncement(structuredClone(a))).toEqual(a);
  });

  it("leaves an announcement without invitations exactly as before", () => {
    const a = buildAnnouncement(input);
    expect(a).not.toHaveProperty("admission");
    expect(serializeJson(a)).not.toContain("admission");
    expect(isClosed(a)).toBe(false);
    expect(isInvited(a, 10)).toBe(false);
  });

  it("names who is invited and whether only they may join", () => {
    expect(isClosed(closed)).toBe(true);
    expect([10, 20, 30, 40].map((id) => isInvited(closed, id))).toEqual([true, true, true, false]);
  });

  it.each([
    [
      "an unsorted list",
      tamper((a) => {
        a.admission = { mode: "closed", invited: [20, 10, 30] };
      }),
      /strictly ascending/,
    ],
    [
      "a repeated id",
      tamper((a) => {
        a.admission = { mode: "closed", invited: [10, 10, 30] };
      }),
      /strictly ascending/,
    ],
    [
      "an empty list",
      tamper((a) => {
        a.admission = { mode: "open", invited: [] };
      }),
      /fewer than 1 items/,
    ],
    [
      "more invitations than allowed",
      tamper((a) => {
        a.admission = {
          mode: "open",
          invited: Array.from({ length: MAX_INVITED + 1 }, (_, i) => i + 1),
        };
      }),
      /more than 1000 items/,
    ],
    [
      "an id that is not a positive integer",
      tamper((a) => {
        Object.assign(a.admission ?? {}, { invited: [0, 10, 20] });
      }),
      /invited\[0\]/,
    ],
    [
      "a login instead of an id",
      tamper((a) => {
        Object.assign(a.admission ?? {}, { invited: ["octocat", 10, 20] });
      }),
      /invited\[0\]/,
    ],
    [
      "an unknown mode",
      tamper((a) => {
        (a.admission as { mode: string }).mode = "private";
      }),
      /admission\.mode: expected one of/,
    ],
    [
      "an extra admission field",
      tamper((a) => {
        Object.assign(a.admission ?? {}, { logins: ["octocat"] });
      }),
      /unexpected field "logins"/,
    ],
    [
      "a closed mainnet ceremony",
      tamper((a) => {
        a.network = "mainnet";
        a.min_contributions = 50;
      }),
      /a mainnet ceremony cannot be closed/,
    ],
    [
      "a closed ceremony that cannot reach its minimum",
      tamper((a) => {
        a.min_contributions = 4;
      }),
      /must invite at least min_contributions \(4\)/,
    ],
  ])("refuses %s", (_, value, error) => {
    expect(() => validateAnnouncement(value)).toThrow(error);
  });
});
