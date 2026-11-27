/**
 * The archive as the page reads it: the list from `/api/archive`, each ceremony's announcement read
 * strictly from `/archive/<id>/ceremony.json` (valid JSON that is not canonical is refused, as
 * every tool refuses it), its status when there is one, latest first.
 */
import {
  buildAnnouncement,
  CIRCUITS_REPO_URL,
  serializeJson,
  sha256Hex,
  utf8,
} from "@orbinum-ceremony/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getArchive } from "../../../src/api";

const announcementOf = (id: string, open: string) =>
  serializeJson(
    buildAnnouncement({
      ceremonyId: id,
      network: "testnet",
      initSha256: "ab".repeat(32),
      circuitsSource: { repo: CIRCUITS_REPO_URL, tag: "v0.17.1", commit: "e".repeat(40) },
      minContributions: 2,
      ...(id === "private-1" ? { admission: { mode: "closed", invited: [1, 2] } as const } : {}),
      open: new Date(open),
      close: new Date(Date.parse(open) + 86_400_000),
      beaconDelaySeconds: 3600,
    }),
  );

function serve(files: Record<string, string>) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = String(input);
    const body = files[path];
    return body === undefined
      ? Response.json(
          { error: { code: "not-found", message: "no such artifact" } },
          { status: 404 },
        )
      : new Response(body);
  });
}

afterEach(() => vi.restoreAllMocks());

describe("getArchive", () => {
  it("reads each ceremony's announcement and status, latest to open first", async () => {
    const earlier = announcementOf("rehearsal-0", "2026-10-01T00:00:00.000Z");
    const later = announcementOf("private-1", "2026-11-25T00:00:00.000Z");
    serve({
      "/api/archive": JSON.stringify({
        current: "private-1",
        ceremonies: ["private-1", "rehearsal-0"].toSorted(),
      }),
      "/archive/rehearsal-0/ceremony.json": earlier,
      "/archive/private-1/ceremony.json": later,
      "/archive/rehearsal-0/status.json": JSON.stringify({ phase: "FINALIZED", sessions: 7 }),
    });
    const archive = await getArchive();
    expect(archive.map((c) => [c.id, c.current])).toEqual([
      ["private-1", true],
      ["rehearsal-0", false],
    ]);
    expect(archive[0]?.announcement?.admission).toEqual({ mode: "closed", invited: [1, 2] });
    expect(archive[0]?.announcementSha256).toBe(sha256Hex(utf8(later)));
    expect(archive[0]?.status).toBeNull();
    expect(archive[1]?.status).toMatchObject({ phase: "FINALIZED", sessions: 7 });
  });

  it("keeps a ceremony whose announcement cannot be read, without one", async () => {
    const valid = announcementOf("rehearsal-0", "2026-10-01T00:00:00.000Z");
    serve({
      "/api/archive": JSON.stringify({ current: "x", ceremonies: ["broken", "rehearsal-0"] }),
      "/archive/broken/ceremony.json": `${valid} `,
      "/archive/rehearsal-0/ceremony.json": valid,
    });
    const archive = await getArchive();
    expect(archive.map((c) => [c.id, c.announcement === null])).toEqual([
      ["rehearsal-0", false],
      ["broken", true],
    ]);
  });

  it("fails when the list itself cannot be read", async () => {
    serve({});
    await expect(getArchive()).rejects.toThrow("no such artifact");
  });
});
