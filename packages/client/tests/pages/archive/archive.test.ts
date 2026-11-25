/** One archived ceremony on the page: what it was, its files and how to verify it from here. */
import { buildAnnouncement, CIRCUITS_REPO_URL } from "@orbinum-ceremony/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ArchivedCeremony } from "../../../src/api";
import { CeremonyCard } from "../../../src/pages/archive";

const announcement = buildAnnouncement({
  ceremonyId: "orbinum-testnet-private-1",
  network: "testnet",
  initSha256: "ab".repeat(32),
  circuitsSource: { repo: CIRCUITS_REPO_URL, tag: "v0.17.1", commit: "e".repeat(40) },
  minContributions: 2,
  admission: { mode: "closed", invited: [1, 2] },
  open: new Date("2026-11-25T00:00:00.000Z"),
  close: new Date("2026-11-26T00:00:00.000Z"),
  beaconDelaySeconds: 3600,
});

const ceremony: ArchivedCeremony = {
  id: "orbinum-testnet-private-1",
  current: true,
  announcement,
  announcementSha256: "cd".repeat(32),
  status: {
    ceremony_id: "orbinum-testnet-private-1",
    phase: "FINALIZED",
    queued: 0,
    active: false,
    sessions: 3,
    heads: { shield: { index: 3, output_sha256: "00".repeat(32) } },
    records: 12,
    head_chain: "11".repeat(32),
  },
};

const render = (c: ArchivedCeremony) =>
  renderToStaticMarkup(createElement(CeremonyCard, { c, origin: "https://ceremony.example" }));

describe("CeremonyCard", () => {
  it("names the ceremony, its state and how it was run", () => {
    const html = render(ceremony);
    for (const text of [
      "orbinum-testnet-private-1",
      "Current",
      "Invite only",
      "Finalized",
      "testnet",
    ]) {
      expect(html).toContain(text);
    }
  });

  it("links its files under the archive, and verifies from there against the published hash", () => {
    const html = render(ceremony);
    for (const file of ["ceremony.json", "genesis/init.json", "transcript.json", "status.json"]) {
      expect(html).toContain(`href="/archive/orbinum-testnet-private-1/${file}"`);
    }
    expect(html).toContain(
      "--from https://ceremony.example/archive/orbinum-testnet-private-1 --dir orbinum-testnet-private-1",
    );
    expect(html).toContain("&lt;sha256-published-by-orbinum&gt;");
    expect(html).toContain("cd".repeat(32));
  });

  it("says so when its announcement could not be read, and shows no badges it cannot know", () => {
    const html = render({ ...ceremony, current: false, announcement: null, status: null });
    expect(html).toContain("Its announcement could not be read.");
    expect(html).not.toContain("Invite only");
    expect(html).not.toContain("Current");
  });
});
