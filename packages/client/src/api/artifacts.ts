/** The ceremony's public files (`/artifacts/…`, SPEC §6.1): the setup and the chain's keys. */
import {
  CEREMONY_LAYOUT,
  type CircuitName,
  fromUtf8,
  parseInit,
  sha256Hex,
} from "@orbinum-ceremony/core";
import { call, getBytes } from "./http";

/** Each circuit's csHash, from the published `init.json`: a head must be that circuit's. */
export async function getCsHashes(): Promise<Map<CircuitName, string>> {
  const init = parseInit(fromUtf8(await getBytes(`/artifacts/${CEREMONY_LAYOUT.init}`)));
  return new Map(init.circuits.map((c) => [c.name, c.cs_hash]));
}

/** A file a head names (`Head.url`). */
export const download = (url: string) => getBytes(url);

/**
 * When the ceremony opens and closes, and whether only invited accounts may join, from its
 * published announcement (`ceremony.json`).
 */
export interface Schedule {
  open: string;
  close: string;
  inviteOnly: boolean;
}

export async function getSchedule(): Promise<Schedule> {
  const { schedule, admission } = await call<{
    schedule: { open: string; close: string };
    admission?: { mode: string };
  }>("GET", `/artifacts/${CEREMONY_LAYOUT.announcement}`);
  return { open: schedule.open, close: schedule.close, inviteOnly: admission?.mode === "closed" };
}

/** The SHA-256 of the announcement as served here (the CLI wants the one Orbinum published). */
export const getAnnouncementSha256 = async () =>
  sha256Hex(await getBytes(`/artifacts/${CEREMONY_LAYOUT.announcement}`));
