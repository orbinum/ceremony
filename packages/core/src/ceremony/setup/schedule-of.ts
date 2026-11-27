/** The contribution window a setup's announcement fixed, in epoch ms. */
import type { Setup } from "./types";

export const scheduleOf = (setup: Setup) => ({
  openAt: Date.parse(setup.announcement.schedule.open),
  closeAt: Date.parse(setup.announcement.schedule.close),
});
