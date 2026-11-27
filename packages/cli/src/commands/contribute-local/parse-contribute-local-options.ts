/** Parses `contribute-local` argv; a bad option is a `UsageError`. */
import { join } from "node:path";
import { CEREMONY_LAYOUT } from "@orbinum-ceremony/core";
import { intOption, parseOptions, pathOption, required } from "../../args";
import type { ContributeLocalOptions } from "./types";

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
