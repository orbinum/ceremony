/** Waits `ms`: the real clock, where the tests inject their own. */
import type { Sleep } from "../types";

export const sleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
