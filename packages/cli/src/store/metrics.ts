/** Local-only timings and sizes of simulated contributions, kept next to the ceremony. */
import { existsSync } from "node:fs";
import { asObject, asSafeInt, type CircuitName } from "@orbinum-ceremony/core";
import { layout } from "../artifacts";
import { readJsonFile, writeJson } from "../io";

/** One contribution's size and timings (ms). */
export interface ContributionMetrics {
  bytes: number;
  ms: { contribute: number; precheck: number; verify: number; verify_from_r1cs?: number };
}

/** Keyed `<circuit>/<index>`. */
export type Metrics = Record<string, ContributionMetrics>;

const MAX_METRICS_BYTES = 16 * 1024 * 1024;

/** The key of one contribution's metrics. */
export const metricsKey = (circuit: CircuitName, index: number) => `${circuit}/${index}`;

const n = (x: unknown, p: string) => asSafeInt(x, p, 0, Number.MAX_SAFE_INTEGER);

function entry(v: unknown, p: string): ContributionMetrics {
  const o = asObject(v, p);
  const ms = asObject(o.ms, `${p}.ms`);
  return {
    bytes: n(o.bytes, `${p}.bytes`),
    ms: {
      contribute: n(ms.contribute, `${p}.ms.contribute`),
      precheck: n(ms.precheck, `${p}.ms.precheck`),
      verify: n(ms.verify, `${p}.ms.verify`),
      ...(ms.verify_from_r1cs === undefined
        ? {}
        : { verify_from_r1cs: n(ms.verify_from_r1cs, `${p}.ms.verify_from_r1cs`) }),
    },
  };
}

/** The metrics so far; none when the file does not exist. */
export async function loadMetrics(dir: string): Promise<Metrics> {
  const path = layout(dir).metrics;
  if (!existsSync(path)) return {};
  const raw = asObject((await readJsonFile(path, MAX_METRICS_BYTES)).value, "metrics");
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, entry(v, `metrics.${k}`)]));
}

/** Writes the metrics atomically. */
export const saveMetrics = (dir: string, metrics: Metrics) =>
  writeJson(layout(dir).metrics, metrics);
