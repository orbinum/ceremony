/**
 * The local-only timings and sizes of simulated contributions so far, kept next to the ceremony and
 * validated on read; none when the file does not exist.
 */
import { existsSync } from "node:fs";
import { asObject, asSafeInt } from "@orbinum-ceremony/core";
import { layout } from "../artifacts";
import { readJsonFile } from "../io";
import type { ContributionMetrics, Metrics } from "./types";

const MAX_METRICS_BYTES = 16 * 1024 * 1024;

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

export async function loadMetrics(dir: string): Promise<Metrics> {
  const path = layout(dir).metrics;
  if (!existsSync(path)) return {};
  const raw = asObject((await readJsonFile(path, MAX_METRICS_BYTES)).value, "metrics");
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, entry(v, `metrics.${k}`)]));
}
