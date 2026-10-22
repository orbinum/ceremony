/** `init` options. */
import { join } from "node:path";
import { asCeremonyId, asTag } from "@orbinum-ceremony/core";
import { optionalPath, parseOptions, pathOption, required, UsageError } from "../../args";

/** The ceremony id, the audited release to build, and where. */
export interface InitOptions {
  ceremonyId: string;
  circuitsRepo: string;
  circuitsRef: string;
  out: string;
  ptau?: string;
  checkDeterminism: boolean;
  force: boolean;
}

/** Usage text, printed by `--help` and on a usage error. */
export const INIT_USAGE = `orbinum-ceremony init --ceremony-id <id> --circuits-repo <path> --circuits-ref <tag>
    [--out <dir>]            default: artifacts/<ceremony-id>
    [--ptau <file>]          use a local ptau instead of downloading it (hash is still checked)
    [--check-determinism]    build every genesis twice and require identical bytes (A1/A3)
    [--force]                rebuild a ceremony directory not yet announced or contributed to`;

/** Parses argv; a bad option is a `UsageError`. */
export function parseInitOptions(argv: string[]): InitOptions {
  const values = parseOptions(argv, {
    "ceremony-id": { type: "string" },
    "circuits-repo": { type: "string" },
    "circuits-ref": { type: "string" },
    out: { type: "string" },
    ptau: { type: "string" },
    "check-determinism": { type: "boolean", default: false },
    force: { type: "boolean", default: false },
  });
  let ceremonyId: string;
  try {
    ceremonyId = asCeremonyId(required(values["ceremony-id"], "ceremony-id"), "--ceremony-id");
  } catch (error) {
    if (error instanceof UsageError) throw error;
    throw new UsageError("--ceremony-id must be 1–64 of [a-z0-9-]");
  }
  const circuitsRef = required(values["circuits-ref"], "circuits-ref");
  try {
    asTag(circuitsRef, "circuits-ref");
  } catch {
    throw new UsageError("--circuits-ref must be a release tag name");
  }
  const ptau = optionalPath(values.ptau);
  return {
    ceremonyId,
    circuitsRepo: pathOption(required(values["circuits-repo"], "circuits-repo")),
    circuitsRef,
    out: pathOption(values.out ?? join("artifacts", ceremonyId)),
    ...(ptau ? { ptau } : {}),
    checkDeterminism: values["check-determinism"],
    force: values.force,
  };
}
