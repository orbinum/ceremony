/** `contribute-local` options. */
import { join } from "node:path";
import { CEREMONY_LAYOUT } from "@orbinum-ceremony/core";
import { intOption, parseOptions, pathOption, required } from "../../args";

/** A rehearsal ceremony, its ptau, and how many simulated contributors. */
export interface ContributeLocalOptions {
  dir: string;
  ptau: string;
  contributors: number;
  crossCheckR1cs: boolean;
}

/** Usage text, printed by `--help` and on a usage error. */
export const CONTRIBUTE_LOCAL_USAGE = `orbinum-ceremony contribute-local --dir <ceremony dir from init>
    Rehearsals only (local or testnet ceremonies).
    [--contributors <n>]    default: 3 (at most 1000)
    [--ptau <file>]         default: <dir>/${CEREMONY_LAYOUT.ptau}
    [--cross-check-r1cs]    also verify every upload from r1cs and require the same verdict`;

/** Parses argv; a bad option is a `UsageError`. */
export function parseContributeLocalOptions(argv: string[]): ContributeLocalOptions {
  const values = parseOptions(argv, {
    dir: { type: "string" },
    contributors: { type: "string", default: "3" },
    ptau: { type: "string" },
    "cross-check-r1cs": { type: "boolean", default: false },
  });
  const dir = pathOption(required(values.dir, "dir"));
  return {
    dir,
    ptau: pathOption(values.ptau ?? join(dir, CEREMONY_LAYOUT.ptau)),
    contributors: intOption(values.contributors, "contributors", 1, 1000),
    crossCheckR1cs: values["cross-check-r1cs"],
  };
}
