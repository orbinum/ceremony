/**
 * When the ceremony opens and closes, and whether only invited accounts may join, from its
 * published announcement (`ceremony.json`).
 */
import { CEREMONY_LAYOUT } from "@orbinum-ceremony/core";
import { call } from "../http";
import type { Schedule } from "../types";

export async function getSchedule(): Promise<Schedule> {
  const { schedule, admission } = await call<{
    schedule: { open: string; close: string };
    admission?: { mode: string };
  }>("GET", `/artifacts/${CEREMONY_LAYOUT.announcement}`);
  return { open: schedule.open, close: schedule.close, inviteOnly: admission?.mode === "closed" };
}
