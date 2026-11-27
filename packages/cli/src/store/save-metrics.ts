/** Writes the local metrics of simulated contributions atomically. */
import { layout } from "../artifacts";
import { writeJson } from "../io";
import type { Metrics } from "./types";

export const saveMetrics = (dir: string, metrics: Metrics) =>
  writeJson(layout(dir).metrics, metrics);
