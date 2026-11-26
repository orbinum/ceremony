/**
 * Admission with announced invitations: invited accounts skip the thresholds and go first; a
 * closed ceremony admits nobody else; the queue takes the invitation from the announcement only.
 * SPEC §3.2.
 */
import { describe, expect, it } from "vitest";
import { buildAnnouncement } from "../../../src/ceremony/announcement";
import {
  admissionRefusals,
  admittedJoin,
  validateGithubProfile,
} from "../../../src/coordination/admission";
import { ANNOUNCEMENT } from "../../support";

const NOW = Date.parse("2026-11-20T00:00:00.000Z");
const at = { cutoff: NOW - 86_400_000, now: NOW };
const profile = (id: number, following: number) =>
  validateGithubProfile({
    id,
    login: `user-${id}`,
    created_at: "2011-01-25T18:44:36Z",
    public_repos: 8,
    following,
  });

const inputOf = (mode: "open" | "closed") =>
  buildAnnouncement({
    ceremonyId: ANNOUNCEMENT.ceremony_id,
    network: "testnet",
    initSha256: ANNOUNCEMENT.init_sha256,
    circuitsSource: ANNOUNCEMENT.circuits_source,
    minContributions: 2,
    admission: { mode, invited: [7, 8] },
    open: new Date(ANNOUNCEMENT.schedule.open),
    close: new Date(ANNOUNCEMENT.schedule.close),
    beaconDelaySeconds: 3600,
  });
const OPEN = inputOf("open");
const CLOSED = inputOf("closed");

describe("admissionRefusals", () => {
  it("applies the thresholds when nobody is invited", () => {
    expect(admissionRefusals(ANNOUNCEMENT, profile(7, 9), at)).toEqual([]);
    expect(admissionRefusals(ANNOUNCEMENT, profile(7, 0), at)).toEqual(["follows-too-few"]);
  });

  it("lets an invited account past the thresholds, open or closed", () => {
    expect(admissionRefusals(OPEN, profile(7, 0), at)).toEqual([]);
    expect(admissionRefusals(CLOSED, profile(8, 0), at)).toEqual([]);
  });

  it("admits other eligible accounts to an open ceremony, none to a closed one", () => {
    expect(admissionRefusals(OPEN, profile(9, 9), at)).toEqual([]);
    expect(admissionRefusals(OPEN, profile(9, 0), at)).toEqual(["follows-too-few"]);
    expect(admissionRefusals(CLOSED, profile(9, 9), at)).toEqual(["not-invited"]);
  });
});

describe("admittedJoin", () => {
  it("takes the invitation from the announcement", () => {
    expect(admittedJoin(ANNOUNCEMENT, 7)).toEqual({ type: "join", githubId: 7, invited: false });
    expect(admittedJoin(OPEN, 7)).toEqual({ type: "join", githubId: 7, invited: true });
    expect(admittedJoin(OPEN, 9)).toEqual({ type: "join", githubId: 9, invited: false });
    expect(admittedJoin(CLOSED, 8)).toEqual({ type: "join", githubId: 8, invited: true });
  });

  it("has no join for an uninvited account of a closed ceremony", () => {
    expect(admittedJoin(CLOSED, 9)).toBeNull();
  });
});
